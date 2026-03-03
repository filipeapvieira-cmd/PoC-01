import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPlugin } from '@/lib/integrations/registry';
import { runIntegration } from '@/lib/runner';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ source: string }> }
) {
    const { source } = await params;

    try {
        const plugin = getPlugin(source);
        if (!plugin) {
            return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 404 });
        }

        const config = plugin.getConfig();

        // Get source config from DB
        const sourceConfig = await prisma.sourceConfig.findUnique({
            where: { slug: source },
        });

        // Get latest ingestion log
        const latestLog = await prisma.ingestionLog.findFirst({
            where: { sourceSlug: source },
            orderBy: { fetchedAt: 'desc' },
        });

        // Get last normalized records
        const latestMetrics = await prisma.metricSeries.findMany({
            where: { sourceSlug: source },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json({
            config,
            sourceConfig: sourceConfig ? {
                ...sourceConfig,
                lastRunAt: sourceConfig.lastRunAt?.toISOString() ?? null,
                createdAt: sourceConfig.createdAt.toISOString(),
                updatedAt: sourceConfig.updatedAt.toISOString(),
            } : null,
            latestLog: latestLog ? {
                ...latestLog,
                fetchedAt: latestLog.fetchedAt.toISOString(),
                createdAt: latestLog.createdAt.toISOString(),
            } : null,
            latestMetrics: latestMetrics.map(m => ({
                ...m,
                periodStart: m.periodStart.toISOString(),
                periodEnd: m.periodEnd.toISOString(),
                createdAt: m.createdAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error(`Error fetching integration ${source}:`, error);
        return NextResponse.json({ error: 'Failed to fetch integration details' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ source: string }> }
) {
    const { source } = await params;

    try {
        const plugin = getPlugin(source);
        if (!plugin) {
            return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const geo = {
            geoType: body.geoType ?? 'council',
            geoCode: body.geoCode ?? 'S12000036',
            geoName: body.geoName ?? 'City of Edinburgh',
        };

        const result = await runIntegration(plugin, geo);

        return NextResponse.json({ result });
    } catch (error) {
        console.error(`Error running integration ${source}:`, error);
        return NextResponse.json({ error: 'Failed to run integration' }, { status: 500 });
    }
}
