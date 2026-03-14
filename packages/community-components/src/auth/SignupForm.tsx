'use client';

import { useState } from 'react';
import Link from 'next/link';
import './AuthForm.css';

interface SignupFormProps {
    onSubmit: (email: string, password: string) => Promise<void>;
    error?: string | null;
}

export default function SignupForm({ onSubmit, error }: SignupFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password !== confirm) {
            setLocalError('Passwords do not match.');
            return;
        }
        setLocalError(null);
        setLoading(true);
        await onSubmit(email, password);
        setLoading(false);
    }

    const displayError = localError ?? error;

    return (
        <div className="auth-page">
            <div className="auth-card">
                <span className="auth-card__eyebrow">Get started</span>
                <h1 className="auth-card__title">Create account</h1>
                <p className="auth-card__subtitle">Join the Sekel Community to share and download decks.</p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {displayError && <p className="auth-form__error-banner">{displayError}</p>}

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
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="confirm">Confirm password</label>
                        <input
                            id="confirm"
                            type="password"
                            className={`auth-form__input${localError ? ' auth-form__input--error' : ''}`}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <button type="submit" className="auth-form__submit" disabled={loading}>
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>

                <p className="auth-card__footer">
                    Already have an account?{' '}
                    <Link href="/login" className="auth-card__link">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
