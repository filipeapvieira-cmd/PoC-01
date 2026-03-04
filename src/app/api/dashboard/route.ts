import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCouncilName } from '@/lib/councils';

// Map Elexon raw fuel codes → human-readable display names
const ELEXON_FUEL_LABELS: Record<string, string> = {
    BIOMASS: 'Biomass',
    CCGT: 'Gas (CCGT)',
    COAL: 'Coal',
    INTELEC: 'Interconnect (Elec)',
    INTFR: 'Interconnect (France)',
    INTIFA2: 'Interconnect (IFA2)',
    INTNED: 'Interconnect (Netherlands)',
    INTNEM: 'Interconnect (NEM)',
    INTNSL: 'Interconnect (NSL)',
    INTVKL: 'Interconnect (Viking)',
    NPSHYD: 'Hydro (Pumped Storage)',
    NUCLEAR: 'Nuclear',
    OCGT: 'Gas (OCGT)',
    OIL: 'Oil',
    OTHER: 'Other',
    PS: 'Pumped Storage',
    WIND: 'Wind',
    SOLAR: 'Solar',
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const councilCode = searchParams.get('council') || 'S12000049';
    const councilName = getCouncilName(councilCode);

    try {
        // Fetch source freshness
        const sources = await prisma.sourceConfig.findMany({
            select: { slug: true, lastRunAt: true }
        });
        const lastUpdatedMap = Object.fromEntries(sources.map(s => [s.slug, s.lastRunAt?.toISOString()]));

        // ── 1. Greenspace (Overpass / OSM) ─────────────────────────────────
        const greenspaceRecord = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'osm_greenspace_total' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 2. Waste & Recycling Lifecycle (SEPA) ───────────────────────────
        const wasteRecords = await prisma.metricSeries.findMany({
            where: {
                geoCode: councilCode,
                sourceSlug: 'sepa-waste',
                metricKey: { in: ['recycling_rate_pct', 'waste_generated_tonnes', 'waste_recycled_tonnes', 'waste_landfilled_tonnes'] }
            },
            orderBy: { periodStart: 'desc' },
            take: 10
        });

        const latestRecycling = wasteRecords.find(r => r.metricKey === 'recycling_rate_pct');
        const wasteGenerated = wasteRecords.find(r => r.metricKey === 'waste_generated_tonnes');
        const wasteRecycled = wasteRecords.find(r => r.metricKey === 'waste_recycled_tonnes');
        const wasteLandfilled = wasteRecords.find(r => r.metricKey === 'waste_landfilled_tonnes');
        const wasteLifecycle = [
            { stage: 'Generated', value: wasteGenerated?.value ?? 0 },
            { stage: 'Recycled', value: wasteRecycled?.value ?? 0 },
            { stage: 'Landfilled', value: wasteLandfilled?.value ?? 0 },
        ];

        // ── 3. Cycling Routes (Overpass / OSM) ─────────────────────────────
        const cyclewayRecord = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'osm_cycleway_count' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 4. Protected Areas (NatureScot) ─────────────────────────────────
        const protectedAreasRecord = await prisma.metricSeries.findFirst({
            where: { metricKey: 'protected_areas_datasets_count', sourceSlug: 'naturescot' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 5. Carbon Intensity (Scotland) ─────────────────────────────────
        const carbonIntensityRecord = await prisma.metricSeries.findFirst({
            where: { metricKey: 'carbon_intensity_forecast', geoCode: 'scotland' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 5.5 Air Quality (Scottish Air Quality) ──────────────────────────
        // AQI Data is per-station. To find a relevant AQI, we match station names against the council
        const aqiRecords = await prisma.metricSeries.findMany({
            where: { sourceSlug: 'scottish-air-quality', metricKey: 'air_quality_pm10' },
            orderBy: { periodStart: 'desc' },
            take: 100 // get recent records
        });

        // Find the best matching station for this council
        const bestWords = councilName.toLowerCase().replace('city of ', '').replace(' and ', ' ').split(' ').filter(w => w.length > 2);
        let aqiRecord = null;
        for (const r of aqiRecords) {
            const name = String((r.metadata as Record<string, string>)?.stationName || '').toLowerCase();
            if (bestWords.some(w => name.includes(w))) {
                aqiRecord = r;
                break;
            }
        }
        // Fallback to average of all scottish stations if no exact match for the council visually
        if (!aqiRecord && aqiRecords.length > 0) {
            const avg = aqiRecords.reduce((s, r) => s + r.value, 0) / aqiRecords.length;
            aqiRecord = { ...aqiRecords[0], value: Math.round(avg * 10) / 10 };
        }

        // ── 6. Infrastructure breakdown (parks / gardens / forests / cycleways / EV) ─
        const breakdownKeys = ['osm_park_count', 'osm_garden_count', 'osm_nature_reserve_count', 'osm_forest_count', 'osm_allotments_count', 'osm_cycleway_count', 'ev_charger_count'];
        const breakdownRecords = await prisma.metricSeries.findMany({
            where: { geoCode: councilCode, metricKey: { in: breakdownKeys } },
            distinct: ['metricKey'],
            orderBy: { periodStart: 'desc' },
        });
        const greenspaceBreakdown = breakdownRecords.map(r => ({
            type: r.metricKey
                .replace('osm_', '')
                .replace('_count', '')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase()),
            value: r.value,
            unit: r.unit,
        }));
        const evChargersRecord = breakdownRecords.find(r => r.metricKey === 'ev_charger_count');

        // ── 7. National Generation Mix (Elexon) ─────────────────────────────
        const generationRecords = await prisma.metricSeries.findMany({
            where: { sourceSlug: 'elexon', metricKey: { startsWith: 'generation_' } },
            orderBy: { periodStart: 'desc' },
            take: 20
        });
        const generationMap = new Map<string, typeof generationRecords[0]>();
        for (const gen of generationRecords) {
            if (!generationMap.has(gen.metricKey)) generationMap.set(gen.metricKey, gen);
        }
        const generationMix = Array.from(generationMap.values())
            .filter(g => g.value > 0)
            .map(g => {
                const rawFuel = (g.metadata && typeof g.metadata === 'object' && 'fuelType' in g.metadata)
                    ? String((g.metadata as Record<string, unknown>).fuelType)
                    : g.metricKey.replace('generation_', '').toUpperCase();
                return {
                    fuel: ELEXON_FUEL_LABELS[rawFuel] ?? rawFuel,
                    rawFuel,
                    value: g.value,
                };
            });

        // ── 7.5 Energy Consumption (DESNZ) ─────────────────────────────────
        const energyElec = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'electricity_consumption_gwh', sourceSlug: 'desnz-energy' },
            orderBy: { periodStart: 'desc' }
        });

        const energyGas = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'gas_consumption_gwh', sourceSlug: 'desnz-energy' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 8. Climate Trends (last 14 days) ─────────────────────────────────
        const climateRecords = await prisma.metricSeries.findMany({
            where: {
                geoCode: councilCode,
                metricKey: { in: ['mean_temperature', 'total_precipitation', 'solar_radiation', 'max_wind_gust'] }
            },
            orderBy: { periodStart: 'asc' },
            take: 120
        });

        // Fetch matching national generation history (wind and solar)
        const pastGenerationRecords = await prisma.metricSeries.findMany({
            where: {
                sourceSlug: 'elexon',
                metricKey: { in: ['generation_wind', 'generation_solar'] }
            },
            orderBy: { periodStart: 'desc' },
            take: 200
        });

        const trendsMap = new Map<string, Record<string, unknown>>();
        for (const record of climateRecords) {
            const dateStr = record.periodStart.toISOString().split('T')[0];
            if (!trendsMap.has(dateStr)) trendsMap.set(dateStr, { date: dateStr, national_wind_mw: 0, national_solar_mw: 0 });
            trendsMap.get(dateStr)![record.metricKey] = record.value;
        }

        // Group the 30-minute elexon records into daily averages/max to pair with the daily climate data
        for (const record of pastGenerationRecords) {
            const dateStr = record.periodStart.toISOString().split('T')[0];
            if (trendsMap.has(dateStr)) {
                const dayEntry = trendsMap.get(dateStr)!;
                const fieldName = record.metricKey === 'generation_wind' ? 'national_wind_mw' : 'national_solar_mw';
                // Take maximum generation for the day to match max wind gust philosophy, or sum. Max is visually better here.
                dayEntry[fieldName] = Math.max((dayEntry[fieldName] as number) || 0, record.value);
            }
        }

        const climateTrends = Array.from(trendsMap.values())
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .slice(-14);

        return NextResponse.json({
            councilCode,
            councilName,
            kpis: {
                greenspace: greenspaceRecord
                    ? { value: greenspaceRecord.value, unit: 'green features', lastUpdated: lastUpdatedMap['osm'] } : null,
                recycling: latestRecycling
                    ? { value: latestRecycling.value, unit: '%', lastUpdated: lastUpdatedMap['sepa-waste'] } : null,
                cycling: cyclewayRecord
                    ? { value: cyclewayRecord.value, unit: 'routes', lastUpdated: lastUpdatedMap['osm'] } : null,
                protectedAreas: protectedAreasRecord
                    ? { value: protectedAreasRecord.value, unit: 'SSSI datasets', lastUpdated: lastUpdatedMap['naturescot'] } : null,
                carbonIntensity: carbonIntensityRecord
                    ? { value: carbonIntensityRecord.value, unit: carbonIntensityRecord.unit, lastUpdated: lastUpdatedMap['neso'] || lastUpdatedMap['elexon'] } : null,
                aqi: aqiRecord
                    ? { value: aqiRecord.value, unit: aqiRecord.unit, lastUpdated: lastUpdatedMap['scottish-air-quality'] } : null,
                energyElec: energyElec
                    ? { value: energyElec.value, unit: energyElec.unit, lastUpdated: lastUpdatedMap['desnz-energy'] } : null,
                energyGas: energyGas
                    ? { value: energyGas.value, unit: energyGas.unit, lastUpdated: lastUpdatedMap['desnz-energy'] } : null,
                evChargers: evChargersRecord
                    ? { value: evChargersRecord.value, unit: 'stations', lastUpdated: lastUpdatedMap['openchargemap'] } : null,
            },
            wasteLifecycle,
            greenspaceBreakdown,
            generationMix,
            climateTrends
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Dashboard aggregation error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
