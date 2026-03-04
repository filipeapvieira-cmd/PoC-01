'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell
} from 'recharts';
import { Trophy, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RankingEntry {
    rank: number;
    councilCode: string;
    councilName: string;
    value: number;
}

interface MetricDef {
    key: string;
    label: string;
    unit: string;
    higherIsBetter: boolean;
}

interface RankingsData {
    metric: MetricDef;
    availableMetrics: MetricDef[];
    rankings: RankingEntry[];
    totalCouncils: number;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32']; // gold, silver, bronze

function getBadgeColor(rank: number): string {
    if (rank === 1) return '#f59e0b';
    if (rank === 2) return '#94a3b8';
    if (rank === 3) return '#cd7f32';
    return 'var(--text-muted)';
}

function getBarColor(rank: number, total: number, higherIsBetter: boolean): string {
    const pct = higherIsBetter ? 1 - (rank - 1) / total : (rank - 1) / total;
    if (pct > 0.66) return '#10b981';
    if (pct > 0.33) return '#f59e0b';
    return '#ef4444';
}

export default function RankingsPage() {
    const [data, setData] = useState<RankingsData | null>(null);
    const [selectedMetric, setSelectedMetric] = useState('recycling_rate_pct');
    const [loading, setLoading] = useState(true);
    const [chartView, setChartView] = useState<'chart' | 'table'>('chart');

    const fetchRankings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/rankings?metric=${selectedMetric}`);
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error('Rankings fetch error', e);
        } finally {
            setLoading(false);
        }
    }, [selectedMetric]);

    useEffect(() => { fetchRankings(); }, [fetchRankings]);

    const handleExportCSV = () => {
        window.open(`/api/export?metricKey=${selectedMetric}&format=csv`, '_blank');
    };
    const handleExportJSON = () => {
        window.open(`/api/export?metricKey=${selectedMetric}&format=json`, '_blank');
    };

    const rankings = data?.rankings ?? [];
    const metric = data?.metric;

    // Truncate long council names for chart labels
    const chartData = rankings.map(r => ({
        ...r,
        shortName: r.councilName.replace('City of ', '').replace(' and ', ' & '),
    }));

    return (
        <main className="page">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Trophy size={28} color="#f59e0b" />
                        Council Rankings
                    </h1>
                    <p className="page-subtitle">Compare all 32 Scottish councils by key sustainability metric</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="form-select"
                        value={selectedMetric}
                        onChange={e => setSelectedMetric(e.target.value)}
                        style={{ minWidth: '260px' }}
                    >
                        {(data?.availableMetrics ?? []).map(m => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                        <Download size={14} /> CSV
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleExportJSON}>
                        <Download size={14} /> JSON
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                    <span>Loading rankings...</span>
                </div>
            ) : rankings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-text">No data for this metric yet</div>
                    <div className="empty-state-hint">Run ingestion for the relevant data source in Admin → Run</div>
                </div>
            ) : (
                <>
                    {/* Summary stat strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {[rankings[0], rankings[Math.floor(rankings.length / 2)], rankings[rankings.length - 1]].map((r, i) => {
                            const labels = ['Top Council', 'Median Council', 'Lowest Council'];
                            const colors = ['#10b981', '#f59e0b', '#ef4444'];
                            return (
                                <div key={i} className="card" style={{ borderLeft: `4px solid ${colors[i]}`, paddingLeft: '1.25rem' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels[i]}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{r.councilName}</div>
                                    <div style={{ fontSize: '1rem', color: colors[i], fontWeight: 600 }}>
                                        {r.value.toLocaleString()} {metric?.unit}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="card" style={{ borderLeft: '4px solid var(--accent-blue)', paddingLeft: '1.25rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Councils Ranked</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{rankings.length}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {metric?.higherIsBetter ? <TrendingUp size={14} style={{ display: 'inline', marginRight: '4px' }} /> : <TrendingDown size={14} style={{ display: 'inline', marginRight: '4px' }} />}
                                {metric?.higherIsBetter ? 'Higher is better' : 'Lower is better'}
                            </div>
                        </div>
                    </div>

                    {/* View toggle */}
                    <div className="tabs" style={{ marginBottom: '1rem' }}>
                        <button className={`tab ${chartView === 'chart' ? 'active' : ''}`} onClick={() => setChartView('chart')}>📊 Bar Chart</button>
                        <button className={`tab ${chartView === 'table' ? 'active' : ''}`} onClick={() => setChartView('table')}>📋 Table</button>
                    </div>

                    {chartView === 'chart' ? (
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                {metric?.label} — All Councils ({metric?.unit})
                            </h3>
                            <ResponsiveContainer width="100%" height={Math.max(rankings.length * 28, 400)}>
                                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 140, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                    <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}
                                        tickFormatter={v => `${v}${metric?.unit === '%' ? '%' : ''}`} />
                                    <YAxis type="category" dataKey="shortName" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={135} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                        formatter={(v) => [`${Number(v)} ${metric?.unit}`, metric?.label]}
                                        labelFormatter={(label) => {
                                            const entry = chartData.find(d => d.shortName === label);
                                            return entry ? `#${entry.rank} — ${entry.councilName}` : label;
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                        {chartData.map((entry) => (
                                            <Cell
                                                key={entry.councilCode}
                                                fill={getBarColor(entry.rank, rankings.length, metric?.higherIsBetter ?? true)}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '60px' }}>Rank</th>
                                            <th>Council</th>
                                            <th style={{ textAlign: 'right' }}>{metric?.label}</th>
                                            <th style={{ textAlign: 'right', width: '60px' }}>Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankings.map(r => (
                                            <tr key={r.councilCode}>
                                                <td>
                                                    <span style={{
                                                        fontWeight: 700,
                                                        color: getBadgeColor(r.rank),
                                                        fontSize: r.rank <= 3 ? '1.1rem' : '0.875rem',
                                                    }}>
                                                        {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: r.rank <= 3 ? 600 : 400 }}>{r.councilName}</td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.95rem' }}>
                                                    {r.value.toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {metric?.unit}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </main>
    );
}
