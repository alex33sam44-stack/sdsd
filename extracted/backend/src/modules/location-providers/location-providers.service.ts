import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ProviderHealthDaemon } from './health';
import { LocationOrchestrator } from './orchestrator';
import { MapboxProvider } from './providers/mapbox.provider';
import { NominatimProvider } from './providers/nominatim.provider';
import { NoopProvider } from './providers/noop.provider';
import { OsrmProvider } from './providers/osrm.provider';
import { PhotonProvider } from './providers/photon.provider';
import { assertCoordinate, haversineKm, redactQuery } from './privacy';
import type {
  LocationProvider,
  LocationSearchInput,
  ProviderCapability,
  ProviderHealth,
  ReverseGeocodeInput,
  RouteEstimateInput,
} from './types';
import { InvalidLocationInputError, ProviderUnavailableError } from './types';

const MAX_ROUTE_DISTANCE_KM = 1500;

/**
 * Service facade for the location providers module.
 *
 * Bootstraps the provider chain on module init, runs the health
 * daemon on a slow cadence, and exposes a small set of methods the
 * controller (and other modules) can call without knowing which
 * provider answered.
 */
@Injectable()
export class LocationProvidersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationProvidersService.name);
  private providers: LocationProvider[] = [];
  private orchestrator!: LocationOrchestrator;
  private healthDaemon!: ProviderHealthDaemon;

  onModuleInit(): void {
    this.providers = this.buildProviderChain();
    this.healthDaemon = new ProviderHealthDaemon(this.providers);
    this.orchestrator = new LocationOrchestrator(this.providers, this.healthDaemon);
    if (process.env.NODE_ENV !== 'test') {
      this.healthDaemon.start();
    }
    this.logger.log(
      `location providers: ${this.providers.map((p) => `${p.id}${p.isEnabled() ? '' : '(off)'}`).join(' → ')}`,
    );
  }

  onModuleDestroy(): void {
    this.healthDaemon?.stop();
  }

  // ----------------------- public surface -----------------------

  async search(input: LocationSearchInput) {
    const q = redactQuery(input.q);
    if (!q) throw new BadRequestException('q is required');
    if (input.near) assertCoord(input.near, 'near');
    try {
      return await this.orchestrator.search({ ...input, q });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async reverse(input: ReverseGeocodeInput) {
    assertCoord({ lat: input.lat, lng: input.lng }, 'lat/lng');
    try {
      return await this.orchestrator.reverse(input);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async route(input: RouteEstimateInput) {
    if (!input.from || !input.to) throw new BadRequestException('from and to are required');
    assertCoord(input.from, 'from');
    assertCoord(input.to, 'to');
    if (input.via?.length) input.via.forEach((p, i) => assertCoord(p, `via[${i}]`));
    const distance = haversineKm(input.from, input.to);
    if (distance > MAX_ROUTE_DISTANCE_KM) {
      throw new BadRequestException(
        `route too long: ${distance.toFixed(0)}km exceeds limit ${MAX_ROUTE_DISTANCE_KM}km`,
      );
    }
    try {
      return await this.orchestrator.route(input);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  status() {
    return {
      generatedAt: new Date().toISOString(),
      providers: this.providers.map((p) => ({
        id: p.id,
        enabled: p.isEnabled(),
        capabilities: [...p.capabilities],
      })),
      selectionRules: [
        'capability match (search | reverse | route)',
        'health rank (healthy > unknown > degraded > down)',
        'declared order (NoopProvider always last)',
      ],
    };
  }

  health(): ProviderHealth[] {
    return this.healthDaemon.snapshot();
  }

  /**
   * Internal accessor used by tests + future modules that want to
   * drive the orchestrator directly without an HTTP round trip.
   */
  getCapabilities(): Record<ProviderCapability, string[]> {
    const out: Record<ProviderCapability, string[]> = { search: [], reverse: [], route: [] };
    for (const p of this.providers) {
      for (const cap of p.capabilities) {
        if (p.isEnabled()) out[cap].push(p.id);
      }
    }
    return out;
  }

  // ----------------------- internal -----------------------

  private buildProviderChain(): LocationProvider[] {
    const chain: LocationProvider[] = [
      new NominatimProvider(),
      new PhotonProvider(),
      new OsrmProvider(),
      new MapboxProvider(),
      new NoopProvider(),
    ];
    return chain;
  }

  private mapError(err: unknown): HttpException {
    if (err instanceof HttpException) return err;
    if (err instanceof InvalidLocationInputError) {
      return new BadRequestException(err.message);
    }
    if (err instanceof ProviderUnavailableError) {
      return new HttpException(
        { error: 'no_provider_available', tried: err.tried },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return new HttpException('location: internal error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

function assertCoord(point: { lat: number; lng: number }, field: string): void {
  try {
    assertCoordinate(point, field);
  } catch (err) {
    throw new BadRequestException((err as Error).message);
  }
}
