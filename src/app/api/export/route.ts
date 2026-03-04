import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCouncilName } from '@/lib/councils';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const metricKey = searchParams.get('metricKey') ?? undefined;
    const geoCode = searchParams.get('geoCode') ?? undefined;
    const sourceSlug = searchParams.get('sourceSlug') ?? undefined;
    const format = searchParams.get('format') ?? 'csv';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500'), 2000);

    try {
        const records = await prisma.metricSeries.findMany({
            where: {
                ...(metricKey ? { metricKey } : {}),
                ...(geoCode ? { geoCode } : {}),
                ...(sourceSlug ? { sourceSlug } : {}),
            },
            orderBy: [{ metricKey: 'asc' }, { periodStart: 'desc' }],
            take: limit,
            select: {
                id: true,
                metricKey: true,
                sourceSlug: true,
                geoType: true,
                geoCode: true,
                periodStart: true,
                periodEnd: true,
                value: true,
                unit: true,
            },
        });

        // Enrich with council name where possible
        const enriched = records.map(r => ({
            ...r,
            councilName: r.geoCode.startsWith('S12') ? getCouncilName(r.geoCode) : r.geoCode,
            periodStart: r.periodStart.toISOString(),
            periodEnd: r.periodEnd.toISOString(),
        }));

        if (format === 'json') {
            return new NextResponse(JSON.stringify(enriched, null, 2), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="csp-metrics-export.json"`,
                },
            });
        }

        // CSV format
        const csvHeaders = ['id', 'metricKey', 'sourceSlug', 'geoType', 'geoCode', 'councilName', 'periodStart', 'periodEnd', 'value', 'unit'];
        const csvRows = enriched.map(r =>
            csvHeaders.map(h => {
                const v = (r as Record<string, unknown>)[h];
                const s = v == null ? '' : String(v);
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(',')
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        const filename = [
            'csp',
            metricKey ?? 'all',
            geoCode ?? 'all-areas',
            new Date().toISOString().split('T')[0],
        ].join('-') + '.csv';

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
