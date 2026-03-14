'use client';

import { useState } from 'react';
import Link from 'next/link';
import './AuthForm.css';

interface LoginFormProps {
    onSubmit: (email: string, password: string) => Promise<void>;
    error?: string | null;
}

export default function LoginForm({ onSubmit, error }: LoginFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        await onSubmit(email, password);
        setLoading(false);
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <span className="auth-card__eyebrow">Welcome back</span>
                <h1 className="auth-card__title">Sign in</h1>
                <p className="auth-card__subtitle">Access your Sekel Community account.</p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && <p className="auth-form__error-banner">{error}</p>}

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            className="auth-form__input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="auth-form__input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    <button type="submit" className="auth-form__submit" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <p className="auth-card__footer">
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="auth-card__link">Sign up</Link>
                </p>
            </div>
        </div>
    );
}
