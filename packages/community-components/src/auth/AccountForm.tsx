'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import './AuthForm.css';

interface AccountFormProps {
    currentEmail: string;
    onUpdateEmail: (email: string) => Promise<void>;
    onUpdatePassword: (password: string) => Promise<void>;
    onSignOut?: () => void;
    emailError?: string | null;
    passwordError?: string | null;
}

export default function AccountForm({ currentEmail, onUpdateEmail, onUpdatePassword, onSignOut, emailError: externalEmailError, passwordError: externalPasswordError }: AccountFormProps) {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        const stored = localStorage.getItem('sekel-community-theme');
        if (stored === 'light') {
            setTheme('light');
        }
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        if (next === 'light') {
            document.documentElement.dataset.theme = 'light';
            localStorage.setItem('sekel-community-theme', 'light');
        } else {
            delete document.documentElement.dataset.theme;
            localStorage.setItem('sekel-community-theme', 'dark');
        }
    };
    const [newEmail, setNewEmail] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailSuccess, setEmailSuccess] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    async function handleEmailSubmit(e: React.FormEvent) {
        e.preventDefault();
        setEmailError(null);
        setEmailSuccess(false);
        setEmailLoading(true);
        await onUpdateEmail(newEmail);
        setEmailLoading(false);
        setEmailSuccess(true);
        setNewEmail('');
    }

    async function handlePasswordSubmit(e: React.FormEvent) {
        e.preventDefault();
        setPasswordError(null);
        setPasswordSuccess(false);
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }
        setPasswordLoading(true);
        await onUpdatePassword(newPassword);
        setPasswordLoading(false);
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
    }

    return (
        <div className="account-page">
            <div className="account-sections">
                {/* Current account info */}
                <div className="account-info">
                    <span className="auth-card__eyebrow">Your account</span>
                    <p className="account-info__email">{currentEmail}</p>
                    {onSignOut && (
                        <button className="account-sign-out" onClick={onSignOut}>
                            <LogOut size={14} aria-hidden="true" />
                            Sign out
                        </button>
                    )}
                </div>

                {/* Change email */}
                <div className="auth-card">
                    <h2 className="auth-card__title">Change email</h2>
                    <p className="auth-card__subtitle">A confirmation link will be sent to the new address.</p>
                    <form className="auth-form" onSubmit={handleEmailSubmit}>
                        {(emailError || externalEmailError) && <p className="auth-form__error-banner">{emailError ?? externalEmailError}</p>}
                        {emailSuccess && <p className="auth-form__success-banner">Check your inbox to confirm the new email.</p>}
                        <div className="auth-form__field">
                            <label className="auth-form__label" htmlFor="new-email">New email</label>
                            <input
                                id="new-email"
                                type="email"
                                className="auth-form__input"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>
                        <button type="submit" className="auth-form__submit" disabled={emailLoading}>
                            {emailLoading ? 'Sending…' : 'Update email'}
                        </button>
                    </form>
                </div>

                {/* Change password */}
                <div className="auth-card">
                    <h2 className="auth-card__title">Change password</h2>
                    <p className="auth-card__subtitle">Must be at least 6 characters.</p>
                    <form className="auth-form" onSubmit={handlePasswordSubmit}>
                        {(passwordError || externalPasswordError) && <p className="auth-form__error-banner">{passwordError ?? externalPasswordError}</p>}
                        {passwordSuccess && <p className="auth-form__success-banner">Password updated successfully.</p>}
                        <div className="auth-form__field">
                            <label className="auth-form__label" htmlFor="new-password">New password</label>
                            <input
                                id="new-password"
                                type="password"
                                className="auth-form__input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={6}
                                required
                            />
                        </div>
                        <div className="auth-form__field">
                            <label className="auth-form__label" htmlFor="confirm-password">Confirm password</label>
                            <input
                                id="confirm-password"
                                type="password"
                                className={`auth-form__input${passwordError ? ' auth-form__input--error' : ''}`}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <button type="submit" className="auth-form__submit" disabled={passwordLoading}>
                            {passwordLoading ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                </div>

                {/* Preferences */}
                <div className="auth-card account-preferences">
                    <h2 className="auth-card__title">Preferences</h2>
                    <p className="auth-card__subtitle">Appearance settings.</p>
                    <button className="account-theme-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                        {theme === 'dark' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
                        {theme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'}
                    </button>
                </div>
            </div>
        </div>
    );
}
