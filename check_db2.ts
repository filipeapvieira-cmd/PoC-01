import { prisma } from './src/lib/db';
async function main() {
    const data = await prisma.metricSeries.groupBy({
        by: ['metricKey'],
        where: { sourceSlug: 'scottish-air-quality' },
        _count: { _all: true }
    });
    console.log("Scottish Air Quality Metrics:", JSON.stringify(data, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
