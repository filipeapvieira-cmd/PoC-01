'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Source {
    slug: string;
    name: string;
    tier: string;
    docsUrl: string;
    authType: string;
    lastStatus: string;
    lastRunAt: string | null;
    lastError: string | null;
    lastLatencyMs: number | null;
    licence: string;
}

export default function IntegrationsPage() {
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/integrations')
            .then(r => r.json())
            .then(data => {
                setSources(data.sources ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const statusCounts = {
        green: sources.filter(s => s.lastStatus === 'green').length,
        red: sources.filter(s => s.lastStatus === 'red').length,
        unknown: sources.filter(s => s.lastStatus === 'unknown').length,
    };

    const tierACounts = sources.filter(s => s.tier === 'A').length;
    const tierBCounts = sources.filter(s => s.tier === 'B').length;

    if (loading) {
        return (
            <main className="page">
                <div className="loading-container">
                    <div className="spinner" />
                    <span>Loading integrations...</span>
                </div>
            </main>
        );
    }

    return (
        <main className="page">
            <div className="page-header">
                <h1 className="page-title">Integration Health Dashboard</h1>
                <p className="page-subtitle">API integration discovery & validation across {sources.length} sustainability data sources</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{sources.length}</div>
                    <div className="stat-label">Total Sources</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{statusCounts.green}</div>
                    <div className="stat-label">Healthy</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{statusCounts.red}</div>
                    <div className="stat-label">Failed</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ background: 'linear-gradient(135deg, #64748b, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{statusCounts.unknown}</div>
                    <div className="stat-label">Not Run</div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Tier</th>
                            <th>Source</th>
                            <th>Status</th>
                            <th>Auth</th>
                            <th>Last Run</th>
                            <th>Latency</th>
                            <th>Last Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sources.map(source => (
                            <tr key={source.slug} className="clickable">
                                <td>
                                    <span className={`tier-badge tier-${source.tier}`}>{source.tier}</span>
                                </td>
                                <td>
                                    <Link href={`/integrations/${source.slug}`} style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 500 }}>
                                        {source.name}
                                    </Link>
                                </td>
                                <td>
                                    <span className={`status-badge status-${source.lastStatus}`}>
                                        <span className="status-dot" />
                                        {source.lastStatus}
                                    </span>
                                </td>
                                <td style={{ color: source.authType === 'none' ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontSize: '0.8rem' }}>
                                    {source.authType === 'none' ? '✓ Open' : '🔑 Key'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {source.lastRunAt ? new Date(source.lastRunAt).toLocaleString() : '—'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {source.lastLatencyMs ? `${source.lastLatencyMs}ms` : '—'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--accent-red)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.lastError ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Tier A: {tierACounts} sources (must-do backbone)</span>
                <span>•</span>
                <span>Tier B: {tierBCounts} sources (stretch goals)</span>
                <span>•</span>
                <Link href="/admin/run" style={{ color: 'var(--accent-cyan)' }}>Run ingestion →</Link>
            </div>
        </main>
    );
}
