import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

// Bounding boxes for Edinburgh area (default) and Scotland-wide
const SCOTLAND_BBOX = '55.0,-8.0,60.9,-0.7';
const EDINBURGH_BBOX = '55.87,-3.35,56.01,-3.05';

export class OverpassPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'overpass',
            name: 'Overpass API (OpenStreetMap)',
            description: 'OpenStreetMap Overpass API for querying greenspace, parks, gardens, and cycling infrastructure in Scotland.',
            docsUrl: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
            authType: 'none',
            rateLimitNotes: 'Heavy rate limits. Max 2 requests per minute. 10,000 units/day. Cache aggressively.',
            licence: 'ODbL (OpenStreetMap)',
            tier: 'A',
            sampleRequest: 'POST https://overpass-api.de/api/interpreter with Overpass QL for parks in Edinburgh',
            fieldMapping: 'elements[].tags.name → feature name, elements[].type → feature type, count → greenspace_count',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Use a small bounding box query to stay within rate limits
        // Query for parks, gardens, and nature reserves
        const bbox = geo.geoCode === 'S12000036' ? EDINBURGH_BBOX : EDINBURGH_BBOX; // Default to Edinburgh for safety
        const query = `
      [out:json][timeout:25];
      (
        way["leisure"="park"](${bbox});
        way["leisure"="garden"](${bbox});
        way["leisure"="nature_reserve"](${bbox});
        relation["leisure"="park"](${bbox});
      );
      out tags center 50;
    `;

        const url = 'https://overpass-api.de/api/interpreter';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'CSP-Sustainability-Platform/1.0',
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(30000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            const text = await res.text();
            if (res.status === 429) {
                throw new Error('429 Rate limited by Overpass API');
            }
            throw new Error(`Overpass API returned ${res.status}: ${text.substring(0, 500)}`);
        }

        const data = await res.json();
        const payload = JSON.stringify(data, null, 2);

        return {
            data,
            httpStatus: res.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { elements?: Array<{ type: string; id: number; tags?: Record<string, string>; center?: { lat: number; lon: number } }> };

        if (!data?.elements) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Count by leisure type
        const typeCounts: Record<string, number> = {};
        for (const el of data.elements) {
            const leisure = el.tags?.leisure ?? 'unknown';
            typeCounts[leisure] = (typeCounts[leisure] || 0) + 1;
        }

        // Emit greenspace count metric
        results.push({
            metricKey: 'osm_greenspace_count',
            sourceSlug: 'overpass',
            geoType: 'council',
            geoCode: 'S12000036', // Edinburgh
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: data.elements.length,
            unit: 'features',
            metadata: {
                query: 'leisure=park|garden|nature_reserve',
                typeCounts,
                attribution: 'OpenStreetMap contributors',
                licence: 'ODbL',
            },
        });

        // Emit per-type counts
        for (const [type, count] of Object.entries(typeCounts)) {
            results.push({
                metricKey: `osm_${type.replace(/[^a-z0-9]/g, '_')}_count`,
                sourceSlug: 'overpass',
                geoType: 'council',
                geoCode: 'S12000036',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: count,
                unit: 'features',
                metadata: {
                    leisureType: type,
                    attribution: 'OpenStreetMap contributors',
                    licence: 'ODbL',
                },
            });
        }

        // Also emit individual notable features (named parks)
        const namedFeatures = data.elements.filter(el => el.tags?.name).slice(0, 20);
        for (const feature of namedFeatures) {
            results.push({
                metricKey: 'osm_named_greenspace',
                sourceSlug: 'overpass',
                geoType: 'council',
                geoCode: 'S12000036',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: 1,
                unit: 'feature',
                metadata: {
                    name: feature.tags?.name,
                    type: feature.tags?.leisure,
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
