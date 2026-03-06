/**
 * CLI Data Ingestion Script
 *
 * Usage:
 *   npx tsx scripts/ingest.ts              # Run all sources
 *   npx tsx scripts/ingest.ts desnz-energy  # Run single source
 *   npm run ingest                          # Run all (via package.json)
 *   npm run ingest -- desnz-energy          # Run single source
 */

import { getAllPlugins, getPlugin } from '../src/lib/integrations/registry';
import { runIntegration, runAll } from '../src/lib/runner';
import 'dotenv/config';

async function main() {
    const sourceSlug = process.argv[2];
    const geo = {
        geoType: 'council' as const,
        geoCode: 'S12000036',
        geoName: 'City of Edinburgh',
    };

    console.log('🔄 CSP Data Ingestion Engine');
    console.log('═══════════════════════════════════════════');

    const start = Date.now();

    if (sourceSlug) {
        // Single source
        const plugin = getPlugin(sourceSlug);
        if (!plugin) {
            console.error(`❌ Unknown source: ${sourceSlug}`);
            console.log('Available sources:', getAllPlugins().map(p => p.getConfig().slug).join(', '));
            process.exit(1);
        }
        console.log(`📥 Running: ${plugin.getConfig().name} (${sourceSlug})`);
        const result = await runIntegration(plugin, geo);
        printResult(result);
    } else {
        // All sources
        const plugins = getAllPlugins();
        console.log(`📥 Running ${plugins.length} sources...\n`);
        const results = await runAll(plugins, geo);
        for (const result of results) {
            printResult(result);
        }
        console.log('═══════════════════════════════════════════');
        console.log(`✅ ${results.filter(r => r.success).length}/${results.length} sources succeeded`);
        console.log(`📊 ${results.reduce((s, r) => s + r.recordCount, 0)} total records ingested`);
    }

    const elapsed = Date.now() - start;
    console.log(`⏱️  Completed in ${(elapsed / 1000).toFixed(1)}s`);
}

function printResult(r: { sourceSlug: string; success: boolean; recordCount: number; latencyMs: number; error?: string }) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon} ${r.sourceSlug}: ${r.recordCount} records (${r.latencyMs}ms)${r.error ? ` — ${r.error}` : ''}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
