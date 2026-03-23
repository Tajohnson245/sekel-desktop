'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

export default function DashboardLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('error') === 'unauthorized') {
            setError('Access denied. Admin only.');
        }
    }, []);
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const supabase = createBrowserClient();
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
                return;
            }

            router.push('/dashboard');
            router.refresh();
        } catch {
            setError('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem',
        }}>
            <form
                onSubmit={handleLogin}
                style={{
                    width: '100%',
                    maxWidth: '400px',
                    background: '#141414',
                    border: '1px solid #262626',
                    borderRadius: '0.75rem',
                    padding: '2rem',
                }}
            >
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                    color: '#fafafa',
                }}>
                    Sekel Dashboard
                </h1>
                <p style={{ fontSize: '0.875rem', color: '#737373', marginBottom: '1.5rem' }}>
                    Admin access only
                </p>

                {error && (
                    <div style={{
                        background: '#2d1215',
                        border: '1px solid #7f1d1d',
                        color: '#fca5a5',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        marginBottom: '1rem',
                    }}>
                        {error}
                    </div>
                )}

                <label style={{ display: 'block', marginBottom: '1rem' }}>
                    <span style={{ display: 'block', fontSize: '0.875rem', color: '#a3a3a3', marginBottom: '0.375rem' }}>Email</span>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            background: '#0a0a0a',
                            border: '1px solid #262626',
                            borderRadius: '0.5rem',
                            color: '#fafafa',
                            fontSize: '0.875rem',
                            outline: 'none',
                        }}
                    />
                </label>

                <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                    <span style={{ display: 'block', fontSize: '0.875rem', color: '#a3a3a3', marginBottom: '0.375rem' }}>Password</span>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            background: '#0a0a0a',
                            border: '1px solid #262626',
                            borderRadius: '0.5rem',
                            color: '#fafafa',
                            fontSize: '0.875rem',
                            outline: 'none',
                        }}
                    />
                </label>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '0.625rem',
                        background: loading ? '#262626' : '#fafafa',
                        color: loading ? '#737373' : '#0a0a0a',
                        border: 'none',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? 'Signing in...' : 'Sign in'}
                </button>
            </form>
        </div>
    );
}
