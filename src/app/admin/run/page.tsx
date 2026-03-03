'use client';

import { useState } from 'react';
import Link from 'next/link';

interface RunResult {
    sourceSlug: string;
    success: boolean;
    recordCount: number;
    latencyMs: number;
    error?: string;
    errorType?: string;
}

const SOURCES = [
    { slug: 'carbon-intensity', name: 'Carbon Intensity API', tier: 'A' },
    { slug: 'statistics-gov-scot', name: 'statistics.gov.scot SPARQL', tier: 'A' },
    { slug: 'scottish-air-quality', name: 'Scottish Air Quality', tier: 'A' },
    { slug: 'overpass', name: 'Overpass API (OSM)', tier: 'A' },
    { slug: 'naturescot', name: 'NatureScot Protected Areas', tier: 'A' },
    { slug: 'sepa-waste', name: 'SEPA Waste Data', tier: 'A' },
    { slug: 'elexon', name: 'Elexon BMRS', tier: 'A' },
    { slug: 'ons', name: 'ONS Beta API', tier: 'B' },
    { slug: 'neso-ckan', name: 'NESO CKAN', tier: 'B' },
    { slug: 'openchargemap', name: 'OpenChargeMap', tier: 'B' },
];

export default function AdminRunPage() {
    const [running, setRunning] = useState<string | null>(null); // null | 'all' | slug
    const [results, setResults] = useState<RunResult[]>([]);
    const [geoCode, setGeoCode] = useState('S12000036');
    const [geoName, setGeoName] = useState('City of Edinburgh');

    const handleRunAll = async () => {
        setRunning('all');
        setResults([]);
        try {
            const res = await fetch('/api/admin/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geoType: 'council', geoCode, geoName }),
            });
            const data = await res.json();
            setResults(data.results ?? []);
        } catch (err) {
            console.error(err);
        } finally {
            setRunning(null);
        }
    };

    const handleRunOne = async (slug: string) => {
        setRunning(slug);
        try {
            const res = await fetch('/api/admin/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: slug, geoType: 'council', geoCode, geoName }),
            });
            const data = await res.json();
            if (data.results) {
                setResults(prev => {
                    const filtered = prev.filter(r => r.sourceSlug !== slug);
                    return [...filtered, ...data.results];
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setRunning(null);
        }
    };

    const getResultFor = (slug: string) => results.find(r => r.sourceSlug === slug);

    return (
        <main className="page">
            <div className="page-header">
                <h1 className="page-title">Admin — Run Ingestion</h1>
                <p className="page-subtitle">Trigger data fetching and normalization for one or all sources</p>
            </div>

            <div className="filter-bar">
                <div className="form-group">
                    <label className="form-label">Council Area</label>
                    <select
                        className="form-select"
                        value={geoCode}
                        onChange={e => {
                            setGeoCode(e.target.value);
                            setGeoName(e.target.options[e.target.selectedIndex].text);
                        }}
                    >
                        <option value="S12000036">City of Edinburgh</option>
                        <option value="S12000049">Glasgow City</option>
                        <option value="S12000033">Aberdeen City</option>
                        <option value="S12000008">Dundee City</option>
                        <option value="S12000017">Highland</option>
                        <option value="S12000047">Fife</option>
                        <option value="S12000029">South Lanarkshire</option>
                    </select>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleRunAll}
                    disabled={running !== null}
                    style={{ alignSelf: 'flex-end' }}
                >
                    {running === 'all' ? (
                        <>
                            <div className="spinner" />
                            Running All...
                        </>
                    ) : (
                        '🚀 Run All Sources'
                    )}
                </button>
            </div>

            {results.length > 0 && (
                <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                        <div className="stat-value">{results.length}</div>
                        <div className="stat-label">Sources Run</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ background: 'var(--gradient-green)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            {results.filter(r => r.success).length}
                        </div>
                        <div className="stat-label">Succeeded</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            {results.filter(r => !r.success).length}
                        </div>
                        <div className="stat-label">Failed</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{results.reduce((sum, r) => sum + r.recordCount, 0)}</div>
                        <div className="stat-label">Total Records</div>
                    </div>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Tier</th>
                            <th>Source</th>
                            <th>Action</th>
                            <th>Status</th>
                            <th>Records</th>
                            <th>Latency</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SOURCES.map(source => {
                            const result = getResultFor(source.slug);
                            return (
                                <tr key={source.slug}>
                                    <td>
                                        <span className={`tier-badge tier-${source.tier}`}>{source.tier}</span>
                                    </td>
                                    <td>
                                        <Link href={`/integrations/${source.slug}`} style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 500 }}>
                                            {source.name}
                                        </Link>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleRunOne(source.slug)}
                                            disabled={running !== null}
                                        >
                                            {running === source.slug ? (
                                                <div className="spinner" />
                                            ) : (
                                                '▶ Run'
                                            )}
                                        </button>
                                    </td>
                                    <td>
                                        {result ? (
                                            <span className={`status-badge status-${result.success ? 'green' : 'red'}`}>
                                                <span className="status-dot" />
                                                {result.success ? 'OK' : 'FAIL'}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                        {result?.recordCount ?? '—'}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {result?.latencyMs ? `${result.latencyMs}ms` : '—'}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--accent-red)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {result?.error ?? '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
