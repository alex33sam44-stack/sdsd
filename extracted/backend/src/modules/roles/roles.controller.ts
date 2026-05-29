import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.platform_admin, AppRole.platform_owner)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get(':userId')
  list(@Param('userId') userId: string) {
    return this.service.list(userId);
  }

  @Post(':userId')
  grant(@Param('userId') userId: string, @Body() body: { role: AppRole }) {
    return this.service.grant(userId, body.role);
  }

  @Delete(':userId/:role')
  revoke(@Param('userId') userId: string, @Param('role') role: AppRole) {
    return this.service.revoke(userId, role);
  }
}
