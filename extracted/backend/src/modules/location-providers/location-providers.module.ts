import { Module } from '@nestjs/common';
import { LocationProvidersController } from './location-providers.controller';
import { LocationProvidersService } from './location-providers.service';

/**
 * Location providers module.
 *
 * Strictly additive: it exposes /api/location/* and is independent
 * from the existing /api/local-search surface (those endpoints
 * remain unchanged). Other modules can `imports: [LocationProvidersModule]`
 * to get the service, but no current module is forced to migrate.
 */
@Module({
  controllers: [LocationProvidersController],
  providers: [LocationProvidersService],
  exports: [LocationProvidersService],
})
export class LocationProvidersModule {}
