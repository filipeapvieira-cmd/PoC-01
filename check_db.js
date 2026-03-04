const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();
async function main() {
    const data = await prisma.metricSeries.findMany({
        where: { sourceSlug: 'scottish-air-quality', geoType: 'station' },
        take: 5,
        orderBy: { periodStart: 'desc' }
    });
    console.log(JSON.stringify(data, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
