"use client";

import { useState } from 'react';
import { MultiTrendViewer } from '@/components/MultiTrendViewer';
import { SCOTTISH_COUNCILS } from '@/lib/councils';

export default function TrendsPage() {
    const [selectedCouncil, setSelectedCouncil] = useState('S12000036'); // Default: City of Edinburgh

    // Sort councils alphabetically
    const sortedCouncils = [...SCOTTISH_COUNCILS].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <main className="container">
            <header style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', color: 'var(--text-primary)' }}>Long-Term Trends</h1>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>Historical analysis of sustainability metrics with 5+ years of data coverage.</p>
                </div>

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px var(--shadow-color)', display: 'inline-flex', alignItems: 'center', gap: '1rem', width: 'fit-content' }}>
                    <label htmlFor="council-select" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Select Council:</label>
                    <select
                        id="council-select"
                        value={selectedCouncil}
                        onChange={(e) => setSelectedCouncil(e.target.value)}
                        className="form-select"
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', minWidth: '250px', fontSize: '1rem' }}
                    >
                        {sortedCouncils.map(council => (
                            <option key={council.code} value={council.code}>
                                {council.name}
                            </option>
                        ))}
                    </select>
                </div>
            </header>

            <MultiTrendViewer councilCode={selectedCouncil} />

            <footer style={{ marginTop: '3rem', padding: '1.5rem', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
                <p>Data sourced automatically from the Department for Energy Security and Net Zero (DESNZ) and National Records of Scotland (NRS).</p>
            </footer>
        </main>
    );
}
