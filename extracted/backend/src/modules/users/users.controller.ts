import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './update-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.service.updateProfile(user.id, body);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.platform_admin, AppRole.platform_owner)
  @Get()
  list() {
    return this.service.list();
  }
}
