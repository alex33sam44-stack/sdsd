import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { OptionalTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get()
  search(@CurrentTenant() tenant: { id: string } | null, @Query('q') q: string, @Req() req: any) {
    if (!tenant?.id) return [];
    return this.service.search(tenant.id, q, req.user?.id ?? null);
  }
}
