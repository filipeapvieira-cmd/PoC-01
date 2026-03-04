import { prisma } from './src/lib/db';
async function main() {
    const data = await prisma.metricSeries.groupBy({
        by: ['metricKey', 'sourceSlug'],
        _count: { _all: true }
    });
    console.log("Existing metrics:", JSON.stringify(data.map(d => `${d.sourceSlug} -> ${d.metricKey} (${d._count._all} rows)`).sort(), null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
