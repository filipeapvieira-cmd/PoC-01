import React from 'react';

export function ChartWidget({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            height: '400px'
        }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {title}
            </h3>
            <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                {children}
            </div>
        </div>
    );
}
