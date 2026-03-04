import { IntegrationPlugin } from './interface';
import { CarbonIntensityPlugin } from './carbon-intensity';
import { StatisticsGovScotPlugin } from './statistics-gov-scot';
import { ScottishAirQualityPlugin } from './scottish-air-quality';
import { OverpassPlugin } from './overpass';
import { NatureScotPlugin } from './naturescot';
import { SepaWastePlugin } from './sepa-waste';
import { ElexonPlugin } from './elexon';
import { OnsPlugin } from './ons';
import { NesoCkanPlugin } from './neso-ckan';
import { OpenChargeMapPlugin } from './openchargemap';
import { DesnzEnergyPlugin } from './desnz-energy';

const plugins: IntegrationPlugin[] = [
    // Tier A
    new CarbonIntensityPlugin(),
    new StatisticsGovScotPlugin(),
    new ScottishAirQualityPlugin(),
    new OverpassPlugin(),
    new NatureScotPlugin(),
    new SepaWastePlugin(),
    new ElexonPlugin(),
    // Tier B
    new OnsPlugin(),
    new NesoCkanPlugin(),
    new OpenChargeMapPlugin(),
    new DesnzEnergyPlugin(),
];

const pluginMap = new Map<string, IntegrationPlugin>();
for (const p of plugins) {
    pluginMap.set(p.getConfig().slug, p);
}

export function getAllPlugins(): IntegrationPlugin[] {
    return plugins;
}

export function getPlugin(slug: string): IntegrationPlugin | undefined {
    return pluginMap.get(slug);
}

export function getPluginSlugs(): string[] {
    return plugins.map(p => p.getConfig().slug);
}

export function getPluginConfigs() {
    return plugins.map(p => p.getConfig());
}
