import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SCOTTISH_COUNCILS } from '@/lib/councils';

export const RANKING_METRICS: Array<{
    key: string;
    label: string;
    unit: string;
    higherIsBetter: boolean;
}> = [
        { key: 'recycling_rate_pct', label: 'Household Recycling Rate', unit: '%', higherIsBetter: true },
        { key: 'osm_greenspace_total', label: 'Urban Greenspace Features', unit: 'features', higherIsBetter: true },
        { key: 'osm_cycleway_count', label: 'Cycling Routes (OSM)', unit: 'routes', higherIsBetter: true },
        { key: 'air_quality_pm10', label: 'Air Quality (PM10)', unit: 'µg/m³', higherIsBetter: false },
        { key: 'mean_temperature', label: 'Avg Temperature (7-day)', unit: '°C', higherIsBetter: false },
        { key: 'electricity_consumption_gwh', label: 'Electricity Consumption', unit: 'GWh', higherIsBetter: false },
        { key: 'gas_consumption_gwh', label: 'Gas Consumption', unit: 'GWh', higherIsBetter: false },
        { key: 'waste_generated_tonnes', label: 'Waste Generated', unit: 'tonnes', higherIsBetter: false },
        { key: 'waste_landfilled_tonnes', label: 'Waste Landfilled', unit: 'tonnes', higherIsBetter: false },
        { key: 'ev_charger_count', label: 'Public EV Chargers', unit: 'locations', higherIsBetter: true },
        { key: 'solar_radiation', label: 'Solar Potential (MJ/m²)', unit: 'MJ/m²', higherIsBetter: true },
        { key: 'max_wind_gust', label: 'Wind Potential (km/h)', unit: 'km/h', higherIsBetter: true },
        { key: 'total_precipitation', label: 'Avg Precipitation (7-day)', unit: 'mm', higherIsBetter: false },
        { key: 'max_wind_gust', label: 'Avg Wind Gust (7-day)', unit: 'km/h', higherIsBetter: false },
    ];

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const metricKey = searchParams.get('metric') ?? 'recycling_rate_pct';

    const metricDef = RANKING_METRICS.find(m => m.key === metricKey) ?? RANKING_METRICS[0];

    try {
        // Get the latest value per council for the chosen metric
        // For time-series metrics (climate), average the last 7 records per council
        const isTimeSeries = ['mean_temperature', 'total_precipitation', 'max_wind_gust'].includes(metricKey);

        let councilValues: Array<{ geoCode: string; value: number }> = [];

        if (metricKey.startsWith('air_quality_')) {
            // Map stations to councils by name heuristic
            const records = await prisma.metricSeries.findMany({
                where: { metricKey, sourceSlug: 'scottish-air-quality' },
                orderBy: { periodStart: 'desc' },
                distinct: ['geoCode'],
                select: { value: true, metadata: true },
            });

            const byCouncil = new Map<string, number[]>();
            for (const r of records) {
                const name = String((r.metadata as Record<string, string>)?.stationName || '').toLowerCase();
                for (const council of SCOTTISH_COUNCILS) {
                    const bestWords = council.name.toLowerCase().replace('city of ', '').replace(' and ', ' ').split(' ').filter(w => w.length > 2);
                    if (bestWords.some(w => name.includes(w))) {
                        if (!byCouncil.has(council.code)) byCouncil.set(council.code, []);
                        byCouncil.get(council.code)!.push(r.value);
                    }
                }
            }

            councilValues = Array.from(byCouncil.entries()).map(([geoCode, values]) => ({
                geoCode,
                value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
            }));
        } else if (isTimeSeries) {
            // Aggregate: average of latest 7 records per council
            const records = await prisma.metricSeries.findMany({
                where: { metricKey },
                orderBy: { periodStart: 'desc' },
                take: 32 * 7, // 32 councils × 7 days max
                select: { geoCode: true, value: true },
            });

            const byCouncil = new Map<string, number[]>();
            for (const r of records) {
                if (!byCouncil.has(r.geoCode)) byCouncil.set(r.geoCode, []);
                const arr = byCouncil.get(r.geoCode)!;
                if (arr.length < 7) arr.push(r.value);
            }

            councilValues = Array.from(byCouncil.entries()).map(([geoCode, values]) => ({
                geoCode,
                value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
            }));
        } else {
            // Point-in-time: latest record per council
            const records = await prisma.metricSeries.findMany({
                where: { metricKey },
                orderBy: { periodStart: 'desc' },
                distinct: ['geoCode'],
                select: { geoCode: true, value: true },
            });
            councilValues = records.map(r => ({ geoCode: r.geoCode, value: r.value }));
        }

        // Filter to only valid Scottish council codes and enrich with council name
        const enriched = councilValues
            .map(cv => {
                const council = SCOTTISH_COUNCILS.find(c => c.code === cv.geoCode);
                if (!council) return null;
                return { councilCode: cv.geoCode, councilName: council.name, value: cv.value };
            })
            .filter((x): x is { councilCode: string; councilName: string; value: number } => x !== null);

        // Sort: higher is better → descending; lower is better → ascending
        enriched.sort((a, b) =>
            metricDef.higherIsBetter ? b.value - a.value : a.value - b.value
        );

        // Attach rank
        const ranked = enriched.map((item, i) => ({ ...item, rank: i + 1 }));

        return NextResponse.json({
            metric: metricDef,
            availableMetrics: RANKING_METRICS,
            rankings: ranked,
            totalCouncils: ranked.length,
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
