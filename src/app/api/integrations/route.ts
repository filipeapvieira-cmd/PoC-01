import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPluginConfigs } from '@/lib/integrations/registry';

export async function GET() {
    try {
        // Get stored source configs from DB
        const sourceConfigs = await prisma.sourceConfig.findMany({
            orderBy: { slug: 'asc' },
        });

        // Get plugin configs for sources not yet in DB
        const pluginConfigs = getPluginConfigs();
        const storedSlugs = new Set(sourceConfigs.map(s => s.slug));

        const allSources = [
            ...sourceConfigs.map(s => ({
                slug: s.slug,
                name: s.name,
                tier: s.tier,
                docsUrl: s.docsUrl,
                authType: s.authType,
                authEnvVar: s.authEnvVar,
                rateLimitNotes: s.rateLimitNotes,
                licence: s.licence,
                lastStatus: s.lastStatus,
                lastRunAt: s.lastRunAt?.toISOString() ?? null,
                lastError: s.lastError,
                lastLatencyMs: s.lastLatencyMs,
            })),
            ...pluginConfigs
                .filter(p => !storedSlugs.has(p.slug))
                .map(p => ({
                    slug: p.slug,
                    name: p.name,
                    tier: p.tier,
                    docsUrl: p.docsUrl,
                    authType: p.authType,
                    authEnvVar: p.authEnvVar,
                    rateLimitNotes: p.rateLimitNotes,
                    licence: p.licence,
                    lastStatus: 'unknown' as const,
                    lastRunAt: null,
                    lastError: null,
                    lastLatencyMs: null,
                })),
        ];

        // Sort: Tier A first, then by status
        allSources.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier < b.tier ? -1 : 1;
            return a.slug.localeCompare(b.slug);
        });

        return NextResponse.json({ sources: allSources });
    } catch (error) {
        console.error('Error fetching integrations:', error);
        return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
    }
}
