import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';

@Controller('favorites')
@UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Get()
  list(@CurrentTenant() tenant: { id: string }, @CurrentUser() user: AuthUser) {
    return this.service.list(tenant.id, user.id);
  }

  @Post()
  create(@CurrentTenant() tenant: { id: string }, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.service.create(tenant.id, user.id, body);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: { id: string }, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(tenant.id, user.id, id);
  }
}
