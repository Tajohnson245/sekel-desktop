import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../UI';

export const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { t } = useTranslation();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (loginError) {
            setError(loginError.message);
            setLoading(false);
        }
    };

    return (
        <div className="auth-form-container">
            <h2>{t('auth.login_title')}</h2>
            <form onSubmit={handleLogin}>
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
                {error && <p className="error-message">{error}</p>}
                <Button type="submit" disabled={loading} isLoading={loading} fullWidth>
                    {loading ? t('auth.logging_in') : t('auth.login')}
                </Button>
            </form>
        </div>
    );
};
