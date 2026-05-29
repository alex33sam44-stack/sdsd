import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, query: string, userId?: string | null) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const stops = await this.prisma.routeStop.findMany({
      where: { tenantId, line: { isPublished: true } },
      include: { line: { include: { station: true } } },
    });
    const matches = stops.filter((s) => {
      const kw = (s.keywords as string[] | null) ?? [];
      return s.name.toLowerCase().includes(q) || kw.some((k) => k.toLowerCase().includes(q));
    });
    await this.prisma.searchLog.create({
      data: { tenantId, userId: userId ?? undefined, query, resultCount: matches.length },
    });
    return matches;
  }
}
