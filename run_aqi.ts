import { config } from 'dotenv';
config();
import { getPlugin } from './src/lib/integrations/registry';
import { runIntegration } from './src/lib/runner';

async function main() {
    const plugin = getPlugin('scottish-air-quality');
    if (!plugin) throw new Error("Plugin not found");
    const geo = {
        geoType: 'council',
        geoCode: 'S12000036',
        geoName: 'City of Edinburgh',
    };
    const res = await runIntegration(plugin, geo);
    console.log("Ingestion result:", res);
}

main().catch(console.error).then(() => process.exit(0));
