import { NextResponse } from 'next/server';
import { getAllPlugins } from '@/lib/integrations/registry';
import { runAll } from '@/lib/runner';

/**
 * Cron-triggered ingestion endpoint.
 * Protected by CRON_SECRET env var.
 *
 * Trigger with: GET /api/cron?secret=YOUR_SECRET
 *
 * Can be called by:
 * - Vercel Cron (add to vercel.json)
 * - GitHub Actions scheduled workflow
 * - Windows Task Scheduler: curl http://localhost:3000/api/cron?secret=xxx
 * - Any external cron service (e.g. cron-job.org)
 */
export async function GET(request: Request) {
    // Verify secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const start = Date.now();
        const plugins = getAllPlugins();
        const geo = {
            geoType: 'council' as const,
            geoCode: 'S12000036',
            geoName: 'City of Edinburgh',
        };

        console.log(`[CRON] Starting ingestion for ${plugins.length} sources...`);
        const results = await runAll(plugins, geo);
        const elapsed = Date.now() - start;

        const summary = {
            timestamp: new Date().toISOString(),
            elapsedMs: elapsed,
            sources: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0),
            results: results.map(r => ({
                source: r.sourceSlug,
                success: r.success,
                records: r.recordCount,
                latencyMs: r.latencyMs,
                error: r.error,
            })),
        };

        console.log(`[CRON] Completed: ${summary.successful}/${summary.sources} sources, ${summary.totalRecords} records in ${elapsed}ms`);

        return NextResponse.json(summary);
    } catch (error) {
        console.error('[CRON] Fatal error:', error);
        return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
    }
}
