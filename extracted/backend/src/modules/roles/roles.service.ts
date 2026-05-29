import { Injectable } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userRole.findMany({ where: { userId } });
  }

  async grant(userId: string, role: AppRole) {
    return this.prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role },
    });
  }

  async revoke(userId: string, role: AppRole) {
    await this.prisma.userRole.deleteMany({ where: { userId, role } });
  }
}
