import { NextResponse } from 'next/server';
import { getAllPlugins, getPlugin } from '@/lib/integrations/registry';
import { runIntegration, runAll } from '@/lib/runner';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const sourceSlug = body.source as string | undefined;
        const geo = {
            geoType: body.geoType ?? 'council',
            geoCode: body.geoCode ?? 'S12000036',
            geoName: body.geoName ?? 'City of Edinburgh',
        };

        if (sourceSlug) {
            // Run single source
            const plugin = getPlugin(sourceSlug);
            if (!plugin) {
                return NextResponse.json({ error: `Unknown source: ${sourceSlug}` }, { status: 404 });
            }
            const result = await runIntegration(plugin, geo);
            return NextResponse.json({ results: [result] });
        } else {
            // Run all sources
            const plugins = getAllPlugins();
            const results = await runAll(plugins, geo);
            return NextResponse.json({ results });
        }
    } catch (error) {
        console.error('Error running ingestion:', error);
        return NextResponse.json({ error: 'Failed to run ingestion' }, { status: 500 });
    }
}
