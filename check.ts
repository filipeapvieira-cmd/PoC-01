import { prisma } from './src/lib/db';

async function run() {
    try {
        const counts = await prisma.metricSeries.groupBy({
            by: ['sourceSlug'],
            _count: { _all: true }
        });
        console.log('Metrics per source:');
        counts.forEach(c => console.log(`${c.sourceSlug}: ${c._count._all}`));

        const logs = await prisma.ingestionLog.findMany({
            orderBy: { fetchedAt: 'desc' },
            take: 15
        });
        console.log('\nRecent logs:');
        logs.forEach(l => console.log(`[${l.fetchedAt.toISOString()}] ${l.sourceSlug} - Success: ${l.errorType === null} - Records: ${l.recordCount}${l.errorMessage ? ` - Error: ${l.errorMessage}` : ''}`));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
