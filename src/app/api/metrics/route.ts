import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const geoCode = searchParams.get('geoCode') ?? undefined;
        const metricKey = searchParams.get('metricKey') ?? undefined;
        const sourceSlug = searchParams.get('sourceSlug') ?? undefined;
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

        const where: Record<string, unknown> = {};
        if (geoCode) where.geoCode = geoCode;
        if (metricKey) where.metricKey = metricKey;
        if (sourceSlug) where.sourceSlug = sourceSlug;
        if (from || to) {
            where.periodStart = {};
            if (from) (where.periodStart as Record<string, Date>).gte = new Date(from);
            if (to) (where.periodStart as Record<string, Date>).lte = new Date(to);
        }

        const metrics = await prisma.metricSeries.findMany({
            where,
            orderBy: { periodStart: 'desc' },
            take: limit,
        });

        // Get distinct metric keys for the filter
        const metricKeys = await prisma.metricSeries.groupBy({
            by: ['metricKey'],
            orderBy: { metricKey: 'asc' },
        });

        // Get distinct geo codes
        const geoCodes = await prisma.metricSeries.groupBy({
            by: ['geoCode', 'geoType'],
            orderBy: { geoCode: 'asc' },
        });

        return NextResponse.json({
            metrics: metrics.map(m => ({
                ...m,
                periodStart: m.periodStart.toISOString(),
                periodEnd: m.periodEnd.toISOString(),
                createdAt: m.createdAt.toISOString(),
            })),
            filters: {
                metricKeys: metricKeys.map(m => m.metricKey),
                geoCodes: geoCodes.map(g => ({ geoCode: g.geoCode, geoType: g.geoType })),
            },
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }
}
