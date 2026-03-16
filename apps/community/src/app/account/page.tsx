'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountForm } from '@sekel/community-components';
import { updateEmail, updatePassword, signOut } from '@sekel/db';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function AccountPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.replace('/login?redirect=/account');
        }
    }, [user, loading, router]);

    if (loading || !user) return null;

    async function handleUpdateEmail(email: string) {
        setEmailError(null);
        const { error } = await updateEmail(supabase, email);
        if (error) setEmailError(error.message);
    }

    async function handleUpdatePassword(password: string) {
        setPasswordError(null);
        const { error } = await updatePassword(supabase, password);
        if (error) setPasswordError(error.message);
    }

    async function handleSignOut() {
        await signOut(supabase);
        router.push('/');
    }

    return (
        <AccountForm
            currentEmail={user.email ?? ''}
            onUpdateEmail={handleUpdateEmail}
            onUpdatePassword={handleUpdatePassword}
            onSignOut={handleSignOut}
            emailError={emailError}
            passwordError={passwordError}
        />
    );
}
