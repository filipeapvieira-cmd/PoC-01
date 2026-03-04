'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download } from 'lucide-react';

interface MetricRecord {
    id: string;
    metricKey: string;
    sourceSlug: string;
    geoType: string;
    geoCode: string;
    periodStart: string;
    periodEnd: string;
    value: number;
    unit: string;
    metadata: Record<string, unknown>;
}

interface Filters {
    metricKeys: string[];
    geoCodes: { geoCode: string; geoType: string }[];
}

export default function MetricsPage() {
    const [metrics, setMetrics] = useState<MetricRecord[]>([]);
    const [filters, setFilters] = useState<Filters>({ metricKeys: [], geoCodes: [] });
    const [loading, setLoading] = useState(true);

    // Filter state
    const [selectedMetricKey, setSelectedMetricKey] = useState('');
    const [selectedGeoCode, setSelectedGeoCode] = useState('');
    const [selectedSource, setSelectedSource] = useState('');
    const [limit, setLimit] = useState(100);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedMetricKey) params.set('metricKey', selectedMetricKey);
        if (selectedGeoCode) params.set('geoCode', selectedGeoCode);
        if (selectedSource) params.set('sourceSlug', selectedSource);
        params.set('limit', limit.toString());

        try {
            const res = await fetch(`/api/metrics?${params}`);
            const data = await res.json();
            setMetrics(data.metrics ?? []);
            setFilters(data.filters ?? { metricKeys: [], geoCodes: [] });
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [selectedMetricKey, selectedGeoCode, selectedSource, limit]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    // Build chart data (group by metricKey, show values over time)
    const chartMetrics = metrics.filter(m => typeof m.value === 'number' && !isNaN(m.value));
    const uniqueKeys = [...new Set(chartMetrics.map(m => m.metricKey))].slice(0, 5);
    const maxValue = Math.max(...chartMetrics.map(m => m.value), 1);

    return (
        <main className="page">
            <div className="page-header">
                <h1 className="page-title">Metrics Explorer</h1>
                <p className="page-subtitle">Query normalized metrics across all integrated data sources</p>
            </div>

            <div className="filter-bar">
                <div className="form-group">
                    <label className="form-label">Metric Key</label>
                    <select
                        className="form-select"
                        value={selectedMetricKey}
                        onChange={e => setSelectedMetricKey(e.target.value)}
                    >
                        <option value="">All metrics</option>
                        {filters.metricKeys.map(k => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Geo Code</label>
                    <select
                        className="form-select"
                        value={selectedGeoCode}
                        onChange={e => setSelectedGeoCode(e.target.value)}
                    >
                        <option value="">All areas</option>
                        {filters.geoCodes.map(g => (
                            <option key={`${g.geoType}-${g.geoCode}`} value={g.geoCode}>
                                {g.geoCode} ({g.geoType})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Limit</label>
                    <select className="form-select" value={limit} onChange={e => setLimit(Number(e.target.value))}>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                    </select>
                </div>

                <button className="btn btn-primary btn-sm" onClick={fetchMetrics} disabled={loading} style={{ alignSelf: 'flex-end' }}>
                    {loading ? 'Loading...' : '🔍 Search'}
                </button>
                <button
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-end' }}
                    onClick={() => {
                        const p = new URLSearchParams();
                        if (selectedMetricKey) p.set('metricKey', selectedMetricKey);
                        if (selectedGeoCode) p.set('geoCode', selectedGeoCode);
                        if (selectedSource) p.set('sourceSlug', selectedSource);
                        p.set('limit', limit.toString());
                        p.set('format', 'csv');
                        window.open(`/api/export?${p}`, '_blank');
                    }}
                >
                    <Download size={14} /> CSV
                </button>
                <button
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-end' }}
                    onClick={() => {
                        const p = new URLSearchParams();
                        if (selectedMetricKey) p.set('metricKey', selectedMetricKey);
                        if (selectedGeoCode) p.set('geoCode', selectedGeoCode);
                        if (selectedSource) p.set('sourceSlug', selectedSource);
                        p.set('limit', limit.toString());
                        p.set('format', 'json');
                        window.open(`/api/export?${p}`, '_blank');
                    }}
                >
                    <Download size={14} /> JSON
                </button>
            </div>

            {/* Simple bar chart visualization */}
            {chartMetrics.length > 0 && uniqueKeys.length <= 5 && (
                <div className="chart-container">
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
                        Value Distribution (top metric keys)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {chartMetrics.slice(0, 20).map((m, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                                    {m.metricKey}
                                </span>
                                <div style={{ flex: 1, height: '24px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div
                                        style={{
                                            height: '100%',
                                            width: `${Math.max((m.value / maxValue) * 100, 2)}%`,
                                            background: 'var(--gradient-blue)',
                                            borderRadius: '4px',
                                            transition: 'width 0.5s ease',
                                        }}
                                    />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '80px', textAlign: 'right' }}>
                                    {m.value.toLocaleString()} {m.unit}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Data table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="card-header" style={{ padding: '1rem 1.5rem' }}>
                    <span className="card-title">Results ({metrics.length})</span>
                </div>
                {metrics.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>Metric Key</th>
                                    <th>Geo</th>
                                    <th>Period</th>
                                    <th>Value</th>
                                    <th>Unit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.map(m => (
                                    <tr key={m.id}>
                                        <td style={{ fontSize: '0.8rem' }}>{m.sourceSlug}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.metricKey}</td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            <span style={{ color: 'var(--accent-purple)' }}>{m.geoType}</span> / {m.geoCode}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {new Date(m.periodStart).toLocaleDateString()}
                                        </td>
                                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{m.value.toLocaleString()}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">📊</div>
                        <div className="empty-state-text">No metrics found</div>
                        <div className="empty-state-hint">Run some integrations first, then query the data here</div>
                    </div>
                )}
            </div>
        </main>
    );
}
