import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { signUp } from '@sekel/db';
import { Button, Input } from '../UI';

export const SignupForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const { t } = useTranslation();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError(t('auth.passwords_mismatch'));
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);

        const { error: signupError } = await signUp(supabase, email, password);

        if (signupError) {
            setError(signupError.message);
        } else {
            setMessage('Check your email for the confirmation link!');
        }
        setLoading(false);
    };

    return (
        <div className="auth-form-container">
            <h2>{t('auth.signup_title')}</h2>
            <form onSubmit={handleSignup}>
                <Input
                    label={t('auth.email')}
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                />
                <Input
                    label={t('auth.password')}
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                />
                <Input
                    label={t('auth.confirm_password')}
                    type="password"
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                    required
                />
                {error && <p className="error-message">{error}</p>}
                {message && <p className="success-message">{message}</p>}
                <Button type="submit" disabled={loading} isLoading={loading} fullWidth>
                    {loading ? t('auth.signing_up') : t('auth.signup')}
                </Button>
            </form>
        </div>
    );
};
