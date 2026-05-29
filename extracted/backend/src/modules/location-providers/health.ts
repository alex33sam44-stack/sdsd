import { Logger } from '@nestjs/common';
import type { LocationProvider, ProviderHealth, ProviderId } from './types';

/**
 * Background health daemon for the provider chain.
 *
 * Probes each provider on a slow cadence (default every 60s, never
 * more frequent than 30s to respect Nominatim's usage policy) and
 * exposes the latest snapshot via `snapshot()`.
 *
 * The orchestrator consults this snapshot before each request to
 * skip providers currently marked `down` so we don't waste their
 * rate-limit window on a known-bad endpoint.
 */
export class ProviderHealthDaemon {
  private readonly logger = new Logger(ProviderHealthDaemon.name);
  private readonly state = new Map<ProviderId, ProviderHealth>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly providers: readonly LocationProvider[],
    private readonly intervalMs = 60_000,
    private readonly probeTimeoutMs = 2_500,
  ) {
    for (const provider of providers) {
      this.state.set(provider.id, {
        provider: provider.id,
        state: provider.isEnabled() ? 'unknown' : 'down',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        capabilities: [...provider.capabilities],
        detail: provider.isEnabled() ? undefined : 'disabled (env vars not set)',
      });
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // first probe immediately, async; subsequent on the interval
    void this.probeAll();
    this.timer = setInterval(() => void this.probeAll(), Math.max(30_000, this.intervalMs));
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  snapshot(): ProviderHealth[] {
    return [...this.state.values()];
  }

  isProviderUsable(id: ProviderId): boolean {
    const entry = this.state.get(id);
    if (!entry) return false;
    return entry.state === 'healthy' || entry.state === 'unknown' || entry.state === 'degraded';
  }

  // ------------------------- internal -------------------------

  private async probeAll(): Promise<void> {
    await Promise.all(this.providers.map((p) => this.probe(p)));
  }

  private async probe(provider: LocationProvider): Promise<void> {
    if (!provider.isEnabled()) {
      this.state.set(provider.id, {
        provider: provider.id,
        state: 'down',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        capabilities: [...provider.capabilities],
        detail: 'disabled',
      });
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    const start = Date.now();
    try {
      await provider.probe(controller.signal);
      const latency = Date.now() - start;
      this.state.set(provider.id, {
        provider: provider.id,
        state: latency > this.probeTimeoutMs * 0.7 ? 'degraded' : 'healthy',
        latencyMs: latency,
        checkedAt: new Date().toISOString(),
        capabilities: [...provider.capabilities],
      });
    } catch (err) {
      this.state.set(provider.id, {
        provider: provider.id,
        state: 'down',
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
        capabilities: [...provider.capabilities],
        detail: (err as Error).message,
      });
      this.logger.warn(`provider ${provider.id} probe failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(t);
    }
  }
}
