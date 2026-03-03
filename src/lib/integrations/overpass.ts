import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { MAJOR_SCOTTISH_CITIES, type CouncilArea } from '@/lib/councils';

// Query Overpass for greenspace in 6 major Scottish cities in a single batch
export class OverpassPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'overpass',
            name: 'Overpass API (OpenStreetMap)',
            description: 'OpenStreetMap Overpass API — queries parks, gardens, nature reserves, and cycling infrastructure across 6 major Scottish cities.',
            docsUrl: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
            authType: 'none',
            rateLimitNotes: 'Heavy rate limits. Max 2 requests per minute. Queries 6 cities sequentially.',
            licence: 'ODbL (OpenStreetMap)',
            tier: 'A',
            sampleRequest: 'POST https://overpass-api.de/api/interpreter with QL for parks per council bbox',
            fieldMapping: 'elements[].tags → feature types, count per council → greenspace density',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        const cities = MAJOR_SCOTTISH_CITIES;

        // Build a single combined Overpass query for ALL 6 cities
        // This is more efficient than multiple queries
        const unionParts = cities.map(c => {
            const bbox = c.bbox;
            return `
        way["leisure"="park"](${bbox});
        way["leisure"="garden"](${bbox});
        way["leisure"="nature_reserve"](${bbox});
        relation["leisure"="park"](${bbox});
        way["highway"="cycleway"](${bbox});
        way["landuse"="forest"](${bbox});
        way["landuse"="allotments"](${bbox});`;
        }).join('\n');

        const query = `
      [out:json][timeout:60];
      (
        ${unionParts}
      );
      out tags center 500;
    `;

        const url = 'https://overpass-api.de/api/interpreter';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'CSP-Sustainability-Platform/1.0',
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(60000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            const text = await res.text();
            if (res.status === 429) {
                throw new Error('429 Rate limited by Overpass API');
            }
            throw new Error(`Overpass API returned ${res.status}: ${text.substring(0, 500)}`);
        }

        const data = await res.json() as {
            elements?: Array<{ type: string; id: number; tags?: Record<string, string>; center?: { lat: number; lon: number } }>;
        };

        // Tag each element with which council it belongs to (based on center point)
        const taggedElements = (data.elements ?? []).map(el => ({
            ...el,
            _council: identifyCouncil(el.center?.lat, el.center?.lon, cities),
        }));

        const combined = { elements: taggedElements, queriedCities: cities.map(c => c.name), totalElements: taggedElements.length };
        const payload = JSON.stringify({ totalElements: taggedElements.length, citiesQueried: cities.map(c => c.name), sampleElements: taggedElements.slice(0, 5) }, null, 2);

        return {
            data: combined,
            httpStatus: res.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            elements?: Array<{ type: string; id: number; tags?: Record<string, string>; center?: { lat: number; lon: number }; _council?: string }>;
            queriedCities?: string[];
        };

        if (!data?.elements) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Group by council and feature type
        const councilFeatures: Record<string, Record<string, number>> = {};
        const councilNames: Record<string, string> = {};

        for (const el of data.elements) {
            const councilCode = el._council ?? 'unknown';
            if (councilCode === 'unknown') continue;

            if (!councilFeatures[councilCode]) {
                councilFeatures[councilCode] = {};
                const city = MAJOR_SCOTTISH_CITIES.find(c => c.code === councilCode);
                councilNames[councilCode] = city?.name ?? councilCode;
            }

            // Identify feature type
            let featureType = 'other';
            if (el.tags?.leisure === 'park') featureType = 'park';
            else if (el.tags?.leisure === 'garden') featureType = 'garden';
            else if (el.tags?.leisure === 'nature_reserve') featureType = 'nature_reserve';
            else if (el.tags?.highway === 'cycleway') featureType = 'cycleway';
            else if (el.tags?.landuse === 'forest') featureType = 'forest';
            else if (el.tags?.landuse === 'allotments') featureType = 'allotments';

            councilFeatures[councilCode][featureType] = (councilFeatures[councilCode][featureType] || 0) + 1;
        }

        // Emit per-council, per-type counts
        for (const [code, features] of Object.entries(councilFeatures)) {
            let totalGreenspace = 0;

            for (const [type, count] of Object.entries(features)) {
                totalGreenspace += count;

                results.push({
                    metricKey: `osm_${type}_count`,
                    sourceSlug: 'overpass',
                    geoType: 'council',
                    geoCode: code,
                    periodStart: startOfDay,
                    periodEnd: endOfDay,
                    value: count,
                    unit: 'features',
                    metadata: {
                        featureType: type,
                        councilName: councilNames[code],
                        attribution: 'OpenStreetMap contributors',
                        licence: 'ODbL',
                    },
                });
            }

            // Total greenspace count for the council
            results.push({
                metricKey: 'osm_greenspace_total',
                sourceSlug: 'overpass',
                geoType: 'council',
                geoCode: code,
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: totalGreenspace,
                unit: 'features',
                metadata: {
                    councilName: councilNames[code],
                    breakdown: features,
                    attribution: 'OpenStreetMap contributors',
                    licence: 'ODbL',
                },
            });
        }

        // Also emit individual named parks for discovery
        const namedFeatures = data.elements.filter(el => el.tags?.name && el._council !== 'unknown').slice(0, 50);
        for (const feature of namedFeatures) {
            results.push({
                metricKey: 'osm_named_greenspace',
                sourceSlug: 'overpass',
                geoType: 'council',
                geoCode: feature._council ?? 'unknown',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: 1,
                unit: 'feature',
                metadata: {
                    name: feature.tags?.name,
                    type: feature.tags?.leisure ?? feature.tags?.highway ?? feature.tags?.landuse ?? 'other',
                    osmId: `${feature.type}/${feature.id}`,
                    lat: feature.center?.lat,
                    lon: feature.center?.lon,
                    attribution: 'OpenStreetMap contributors',
                    licence: 'ODbL',
                },
            });
        }

        return results;
    }
}

// Identify which council a point belongs to (simple bounding box check)
function identifyCouncil(lat?: number, lon?: number, cities?: CouncilArea[]): string {
    if (!lat || !lon || !cities) return 'unknown';

    for (const city of cities) {
        const [south, west, north, east] = city.bbox.split(',').map(Number);
        if (lat >= south && lat <= north && lon >= west && lon <= east) {
            return city.code;
        }
    }
    return 'unknown';
}
