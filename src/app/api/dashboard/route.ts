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
        // ── 1. Greenspace (Overpass / OSM) ─────────────────────────────────
        const greenspaceRecord = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'osm_greenspace_total' },
            orderBy: { periodStart: 'desc' }
        });

        // ── 2. Recycling Rate (SEPA) ────────────────────────────────────────
        const recyclingRecord = await prisma.metricSeries.findFirst({
            where: { geoCode: councilCode, metricKey: 'recycling_rate_pct', sourceSlug: 'sepa-waste' },
            orderBy: { periodStart: 'desc' }
        });

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

        // ── 6. Greenspace breakdown (parks / gardens / forests / cycleways) ─
        const breakdownKeys = ['osm_park_count', 'osm_garden_count', 'osm_nature_reserve_count', 'osm_forest_count', 'osm_allotments_count', 'osm_cycleway_count'];
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

        // ── 8. Climate Trends (last 14 days) ─────────────────────────────────
        const climateRecords = await prisma.metricSeries.findMany({
            where: {
                geoCode: councilCode,
                metricKey: { in: ['mean_temperature', 'total_precipitation', 'solar_radiation', 'max_wind_gust'] }
            },
            orderBy: { periodStart: 'asc' },
            take: 120
        });
        const trendsMap = new Map<string, Record<string, unknown>>();
        for (const record of climateRecords) {
            const dateStr = record.periodStart.toISOString().split('T')[0];
            if (!trendsMap.has(dateStr)) trendsMap.set(dateStr, { date: dateStr });
            trendsMap.get(dateStr)![record.metricKey] = record.value;
        }
        const climateTrends = Array.from(trendsMap.values())
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .slice(-14);

        return NextResponse.json({
            councilCode,
            councilName,
            kpis: {
                greenspace: greenspaceRecord
                    ? { value: greenspaceRecord.value, unit: 'green features' } : null,
                recycling: recyclingRecord
                    ? { value: recyclingRecord.value, unit: '%' } : null,
                cycling: cyclewayRecord
                    ? { value: cyclewayRecord.value, unit: 'routes' } : null,
                protectedAreas: protectedAreasRecord
                    ? { value: protectedAreasRecord.value, unit: 'SSSI datasets' } : null,
                carbonIntensity: carbonIntensityRecord
                    ? { value: carbonIntensityRecord.value, unit: carbonIntensityRecord.unit } : null,
            },
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
