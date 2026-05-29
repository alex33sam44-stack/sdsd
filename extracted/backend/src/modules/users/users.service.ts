import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, createdAt: true, profile: true, roles: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProfile(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  updateProfile(id: string, data: { displayName?: string; avatarUrl?: string; defaultStationId?: string }) {
    return this.prisma.profile.update({ where: { id }, data });
  }
}
