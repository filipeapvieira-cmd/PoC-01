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

        // --- Special Handling for Air Quality (Matches stations to councils) ---
        if (metricKey === 'air_quality_pm10' && geoCode && geoCode.startsWith('S12')) {
            const { getCouncilName } = require('@/lib/councils');
            const councilName = getCouncilName(geoCode);
            const bestWords = councilName.toLowerCase().replace('city of ', '').replace(' and ', ' ').split(' ').filter((w: string) => w.length > 2);

            // We just ask for the metric, and we'll filter by station name in memory for the minimal payload
            where.metricKey = metricKey;
        } else {
            if (geoCode) where.geoCode = geoCode;
            if (metricKey) where.metricKey = metricKey;
        }

        if (sourceSlug) where.sourceSlug = sourceSlug;
        if (from || to) {
            where.periodStart = {};
            if (from) (where.periodStart as Record<string, Date>).gte = new Date(from);
            if (to) (where.periodStart as Record<string, Date>).lte = new Date(to);
        }

        const format = searchParams.get('format') ?? 'detailed'; // 'detailed' or 'minimal'

        let metrics = await prisma.metricSeries.findMany({
            where,
            orderBy: { periodStart: format === 'minimal' ? 'asc' : 'desc' },
            take: metricKey === 'air_quality_pm10' ? 1000 : limit, // Need more records to filter stations
        });

        if (metricKey === 'air_quality_pm10' && geoCode && geoCode.startsWith('S12')) {
            const { getCouncilName } = require('@/lib/councils');
            const councilName = getCouncilName(geoCode);
            const bestWords = councilName.toLowerCase().replace('city of ', '').replace(' and ', ' ').split(' ').filter((w: string) => w.length > 2);

            // Filter down to the station that best matches the council
            const matchedMetrics = metrics.filter(r => {
                const name = String((r.metadata as Record<string, string>)?.stationName || '').toLowerCase();
                return bestWords.some((w: string) => name.includes(w));
            });

            if (matchedMetrics.length > 0) {
                // Return only the exact matched station's history
                const bestStationCode = matchedMetrics[0].geoCode;
                metrics = matchedMetrics.filter(r => r.geoCode === bestStationCode);
            } else {
                // Fallback: Just return a Scotland-wide average per day
                const groupedByDate: Record<string, { sum: number, avg: number, count: number, start: Date, unit: string }> = {};
                for (const r of metrics) {
                    const ds = r.periodStart.toISOString().split('T')[0];
                    if (!groupedByDate[ds]) groupedByDate[ds] = { sum: 0, avg: 0, count: 0, start: r.periodStart, unit: r.unit };
                    groupedByDate[ds].sum += r.value;
                    groupedByDate[ds].count += 1;
                    groupedByDate[ds].avg = groupedByDate[ds].sum / groupedByDate[ds].count;
                }
                metrics = Object.values(groupedByDate).map(g => ({
                    ...metrics[0],
                    value: Math.round(g.avg * 10) / 10,
                    periodStart: g.start,
                }));
            }
            if (format !== 'minimal') metrics = metrics.slice(0, limit);
        }

        // If minimal format requested (e.g. for TrendViewer), skip the heavy aggregation
        if (format === 'minimal') {
            return NextResponse.json({
                history: metrics.map(r => ({
                    periodStart: r.periodStart,
                    value: r.value,
                    unit: r.unit,
                }))
            });
        }

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
