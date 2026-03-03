'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface IntegrationConfig {
    slug: string;
    name: string;
    description: string;
    docsUrl: string;
    authType: string;
    authEnvVar?: string;
    rateLimitNotes: string;
    licence: string;
    tier: string;
    sampleRequest: string;
    fieldMapping: string;
}

interface SourceConfig {
    slug: string;
    name: string;
    lastStatus: string;
    lastRunAt: string | null;
    lastError: string | null;
    lastLatencyMs: number | null;
}

interface IngestionLog {
    id: string;
    jobRunId: string;
    fetchedAt: string;
    httpStatus: number | null;
    latencyMs: number | null;
    errorType: string | null;
    errorMessage: string | null;
    retryCount: number;
    rawPayload: string | null;
    recordCount: number;
}

interface MetricRecord {
    id: string;
    metricKey: string;
    geoType: string;
    geoCode: string;
    periodStart: string;
    periodEnd: string;
    value: number;
    unit: string;
    metadata: Record<string, unknown>;
}

export default function IntegrationDetailPage() {
    const params = useParams();
    const source = params.source as string;

    const [config, setConfig] = useState<IntegrationConfig | null>(null);
    const [sourceConfig, setSourceConfig] = useState<SourceConfig | null>(null);
    const [latestLog, setLatestLog] = useState<IngestionLog | null>(null);
    const [latestMetrics, setLatestMetrics] = useState<MetricRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'raw' | 'normalized'>('overview');

    const fetchData = () => {
        fetch(`/api/integrations/${source}`)
            .then(r => r.json())
            .then(data => {
                setConfig(data.config ?? null);
                setSourceConfig(data.sourceConfig ?? null);
                setLatestLog(data.latestLog ?? null);
                setLatestMetrics(data.latestMetrics ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
    }, [source]);

    const handleRun = async () => {
        setRunning(true);
        setRunResult(null);
        try {
            const res = await fetch(`/api/integrations/${source}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geoType: 'council', geoCode: 'S12000036', geoName: 'City of Edinburgh' }),
            });
            const data = await res.json();
            if (data.result?.success) {
                setRunResult(`✓ Success: ${data.result.recordCount} records in ${data.result.latencyMs}ms`);
            } else {
                setRunResult(`✗ Failed: ${data.result?.error ?? 'Unknown error'}`);
            }
            fetchData();
        } catch (err) {
            setRunResult(`✗ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setRunning(false);
        }
    };

    if (loading) {
        return (
            <main className="page">
                <div className="loading-container">
                    <div className="spinner" />
                    <span>Loading integration details...</span>
                </div>
            </main>
        );
    }

    if (!config) {
        return (
            <main className="page">
                <div className="empty-state">
                    <div className="empty-state-icon">❓</div>
                    <div className="empty-state-text">Integration not found: {source}</div>
                    <Link href="/integrations" className="btn btn-secondary" style={{ marginTop: '1rem' }}>← Back to integrations</Link>
                </div>
            </main>
        );
    }

    return (
        <main className="page">
            <div style={{ marginBottom: '1rem' }}>
                <Link href="/integrations" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Integrations</Link>
            </div>

            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h1 className="page-title">{config.name}</h1>
                        <span className={`tier-badge tier-${config.tier}`}>{config.tier}</span>
                        {sourceConfig && (
                            <span className={`status-badge status-${sourceConfig.lastStatus}`}>
                                <span className="status-dot" />
                                {sourceConfig.lastStatus}
                            </span>
                        )}
                    </div>
                    <p className="page-subtitle">{config.description}</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleRun}
                    disabled={running}
                >
                    {running ? (
                        <>
                            <div className="spinner" />
                            Running...
                        </>
                    ) : (
                        '▶ Run Now'
                    )}
                </button>
            </div>

            {runResult && (
                <div className={`alert ${runResult.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
                    {runResult}
                </div>
            )}

            <div className="tabs">
                <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={`tab ${activeTab === 'raw' ? 'active' : ''}`} onClick={() => setActiveTab('raw')}>Raw Payload</button>
                <button className={`tab ${activeTab === 'normalized' ? 'active' : ''}`} onClick={() => setActiveTab('normalized')}>Normalized Data</button>
            </div>

            {activeTab === 'overview' && (
                <>
                    <div className="detail-grid">
                        <div className="card">
                            <div className="detail-label">Documentation</div>
                            <div className="detail-value">
                                <a href={config.docsUrl} target="_blank" rel="noopener noreferrer">{config.docsUrl}</a>
                            </div>
                        </div>
                        <div className="card">
                            <div className="detail-label">Authentication</div>
                            <div className="detail-value">
                                {config.authType === 'none' ? '✓ No authentication required' : `🔑 API Key required (${config.authEnvVar})`}
                            </div>
                        </div>
                        <div className="card">
                            <div className="detail-label">Licence</div>
                            <div className="detail-value">{config.licence}</div>
                        </div>
                        <div className="card">
                            <div className="detail-label">Rate Limits</div>
                            <div className="detail-value">{config.rateLimitNotes}</div>
                        </div>
                        <div className="card detail-full">
                            <div className="detail-label">Sample Request</div>
                            <div className="code-preview">{config.sampleRequest}</div>
                        </div>
                        <div className="card detail-full">
                            <div className="detail-label">Field Mapping</div>
                            <div className="detail-value">{config.fieldMapping}</div>
                        </div>
                    </div>

                    {latestLog && (
                        <div className="card" style={{ marginTop: '1rem' }}>
                            <div className="card-header">
                                <span className="card-title">Last Ingestion Run</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(latestLog.fetchedAt).toLocaleString()}</span>
                            </div>
                            <div className="detail-grid" style={{ marginBottom: 0 }}>
                                <div>
                                    <div className="detail-label">HTTP Status</div>
                                    <div className="detail-value">{latestLog.httpStatus ?? '—'}</div>
                                </div>
                                <div>
                                    <div className="detail-label">Latency</div>
                                    <div className="detail-value">{latestLog.latencyMs ? `${latestLog.latencyMs}ms` : '—'}</div>
                                </div>
                                <div>
                                    <div className="detail-label">Records</div>
                                    <div className="detail-value">{latestLog.recordCount}</div>
                                </div>
                                <div>
                                    <div className="detail-label">Retries</div>
                                    <div className="detail-value">{latestLog.retryCount}</div>
                                </div>
                                {latestLog.errorMessage && (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="detail-label">Error ({latestLog.errorType})</div>
                                        <div className="detail-value" style={{ color: 'var(--accent-red)' }}>{latestLog.errorMessage}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'raw' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Raw API Response</span>
                        {latestLog?.fetchedAt && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Fetched: {new Date(latestLog.fetchedAt).toLocaleString()}
                            </span>
                        )}
                    </div>
                    {latestLog?.rawPayload ? (
                        <div className="code-preview">{latestLog.rawPayload}</div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">📦</div>
                            <div className="empty-state-text">No raw payload available</div>
                            <div className="empty-state-hint">Run the integration to fetch data</div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'normalized' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ padding: '1rem 1.5rem' }}>
                        <span className="card-title">Normalized Metric Records ({latestMetrics.length})</span>
                    </div>
                    {latestMetrics.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Metric Key</th>
                                        <th>Geo</th>
                                        <th>Period</th>
                                        <th>Value</th>
                                        <th>Unit</th>
                                        <th>Metadata</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {latestMetrics.map(m => (
                                        <tr key={m.id}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.metricKey}</td>
                                            <td style={{ fontSize: '0.8rem' }}>
                                                <span style={{ color: 'var(--accent-purple)' }}>{m.geoType}</span>
                                                <span style={{ color: 'var(--text-muted)' }}> / </span>
                                                <span>{m.geoCode}</span>
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(m.periodStart).toLocaleDateString()}
                                            </td>
                                            <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.unit}</td>
                                            <td style={{ maxWidth: '200px' }}>
                                                <details>
                                                    <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}>View</summary>
                                                    <pre style={{ fontSize: '0.7rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                                                        {JSON.stringify(m.metadata, null, 2)}
                                                    </pre>
                                                </details>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">📊</div>
                            <div className="empty-state-text">No normalized data yet</div>
                            <div className="empty-state-hint">Run the integration to generate normalized metrics</div>
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
