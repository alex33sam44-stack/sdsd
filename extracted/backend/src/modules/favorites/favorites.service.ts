import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, userId: string) {
    return this.prisma.favorite.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(tenantId: string, userId: string, data: { kind: string; refId?: string; label?: string; payload?: any }) {
    return this.prisma.favorite.create({ data: { ...data, tenantId, userId } });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.prisma.favorite.deleteMany({ where: { id, tenantId, userId } });
  }
}
