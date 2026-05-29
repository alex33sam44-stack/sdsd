import { Logger } from '@nestjs/common';
import { ProviderHealthDaemon } from './health';
import type {
  LocationProvider,
  LocationSearchHit,
  LocationSearchInput,
  OrchestratorOptions,
  ProviderCapability,
  ProviderId,
  ReverseGeocodeHit,
  ReverseGeocodeInput,
  RouteEstimate,
  RouteEstimateInput,
} from './types';
import { ProviderUnavailableError } from './types';

const DEFAULT_OPTIONS: OrchestratorOptions = {
  perProviderTimeoutMs: 4_000,
  maxAttempts: 4,
};

interface AttemptResult<T> {
  result: T;
  provider: ProviderId;
}

/**
 * Walks the configured provider chain in order, skipping providers
 * the health daemon has marked `down`, applying a per-attempt
 * timeout, and returning the first successful answer. The Noop
 * provider is always last so the chain never fails outright.
 */
export class LocationOrchestrator {
  private readonly logger = new Logger(LocationOrchestrator.name);

  constructor(
    private readonly providers: readonly LocationProvider[],
    private readonly health: ProviderHealthDaemon,
    private readonly opts: OrchestratorOptions = DEFAULT_OPTIONS,
  ) {}

  async search(input: LocationSearchInput): Promise<{
    hits: LocationSearchHit[];
    provider: ProviderId;
    tried: ProviderId[];
  }> {
    const result = await this.firstThatAnswers<LocationSearchHit[]>('search', async (p, signal) => {
      if (!p.search) return null;
      const hits = await p.search(input, signal);
      return hits.length ? hits : null;
    });
    return { hits: result.result, provider: result.provider, tried: result.tried };
  }

  async reverse(input: ReverseGeocodeInput): Promise<{
    hit: ReverseGeocodeHit;
    provider: ProviderId;
    tried: ProviderId[];
  }> {
    const result = await this.firstThatAnswers<ReverseGeocodeHit>('reverse', async (p, signal) => {
      if (!p.reverse) return null;
      return p.reverse(input, signal);
    });
    return { hit: result.result, provider: result.provider, tried: result.tried };
  }

  async route(input: RouteEstimateInput): Promise<{
    estimate: RouteEstimate;
    provider: ProviderId;
    tried: ProviderId[];
  }> {
    const result = await this.firstThatAnswers<RouteEstimate>('route', async (p, signal) => {
      if (!p.route) return null;
      return p.route(input, signal);
    });
    return { estimate: result.result, provider: result.provider, tried: result.tried };
  }

  // ------------------------- internal -------------------------

  private async firstThatAnswers<T>(
    capability: ProviderCapability,
    invoke: (provider: LocationProvider, signal: AbortSignal) => Promise<T | null>,
  ): Promise<AttemptResult<T> & { tried: ProviderId[] }> {
    const ordered = this.orderProviders(capability);
    const tried: ProviderId[] = [];
    for (const provider of ordered) {
      if (tried.length >= this.opts.maxAttempts) break;
      tried.push(provider.id);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.opts.perProviderTimeoutMs);
      try {
        const value = await invoke(provider, controller.signal);
        clearTimeout(timeout);
        if (value != null && (Array.isArray(value) ? value.length > 0 : true)) {
          return { result: value, provider: provider.id, tried };
        }
      } catch (err) {
        clearTimeout(timeout);
        this.logger.warn(
          `provider ${provider.id} ${capability} failed: ${(err as Error).message}`,
        );
      }
    }
    throw new ProviderUnavailableError(tried);
  }

  /**
   * Order providers by:
   *   1. capability match
   *   2. health (healthy > unknown > degraded > down)
   *   3. priority of declaration (Noop is registered last)
   */
  private orderProviders(capability: ProviderCapability): LocationProvider[] {
    const rank = (id: ProviderId): number => {
      const snapshot = this.health.snapshot().find((s) => s.provider === id);
      switch (snapshot?.state) {
        case 'healthy':
          return 0;
        case 'unknown':
          return 1;
        case 'degraded':
          return 2;
        default:
          return 3;
      }
    };
    return [...this.providers]
      .filter((p) => p.capabilities.includes(capability) && p.isEnabled())
      .sort((a, b) => rank(a.id) - rank(b.id));
  }
}
