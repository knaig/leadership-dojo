'use client';

import { useEffect, useState } from 'react';

/**
 * Blocking overlay that prevents product use until the user
 * grants required Google permissions (Calendar, Gmail, Drive).
 *
 * Shown when:
 * - Google account not connected at all
 * - Connected but missing required scopes (user skipped permissions)
 *
 * One-click fix: redirects to /api/auth/google which forces consent screen.
 */
export function GoogleScopeGate({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<'loading' | 'ok' | 'blocked'>('loading');
    const [message, setMessage] = useState('');
    const [missingLabels, setMissingLabels] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        fetch('/api/connectors/status')
            .then(res => res.json())
            .then(data => {
                if (data.hasMissingScopes) {
                    setStatus('blocked');
                    setMessage(data.message || 'Please connect your Google account.');
                    setMissingLabels(data.missingScopeLabels || []);
                    setIsConnected(data.connected || false);
                } else {
                    setStatus('ok');
                }
            })
            .catch(() => {
                // If we can't check, let them through — don't block on network errors
                setStatus('ok');
            });
    }, []);

    if (status === 'loading') return null;
    if (status === 'ok') return <>{children}</>;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="mx-4 max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-xl">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                </div>

                {/* Title */}
                <h2 className="text-center text-xl font-semibold mb-2">
                    {isConnected ? 'Additional Permissions Needed' : 'Connect Your Google Account'}
                </h2>

                {/* Explanation */}
                <p className="text-center text-muted-foreground text-sm mb-4">
                    {isConnected
                        ? 'Mira needs access to your calendar, email, and documents to coach you effectively. Some permissions were not granted during setup.'
                        : 'Mira analyzes your calendar, email, and documents to provide personalized coaching. Connect your Google account to get started.'}
                </p>

                {/* Missing scopes */}
                {missingLabels.length > 0 && (
                    <div className="mb-6 rounded-lg bg-muted/50 p-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Missing permissions:
                        </p>
                        <ul className="space-y-2">
                            {missingLabels.map(label => (
                                <li key={label} className="flex items-center gap-2 text-sm">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                                        <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </span>
                                    <span>{label}</span>
                                    <span className="text-xs text-muted-foreground ml-auto">read-only</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* CTA */}
                <button
                    onClick={() => { window.location.href = '/api/auth/google'; }}
                    className="w-full flex items-center justify-center gap-3 rounded-lg bg-foreground text-background py-3 px-4 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {isConnected ? 'Grant Permissions' : 'Connect Google Account'}
                </button>

                {/* Reassurance */}
                <p className="mt-4 text-center text-xs text-muted-foreground">
                    All access is <span className="font-medium">read-only</span>. Mira never modifies your data.
                    <br />Your data is encrypted and never shared.
                </p>
            </div>
        </div>
    );
}
