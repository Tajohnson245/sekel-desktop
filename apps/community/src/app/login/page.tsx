'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@sekel/community-components';
import { signIn } from '@sekel/db';
import { supabase } from '../../lib/supabase';

function LoginPageInner() {
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();

    async function handleLogin(email: string, password: string) {
        setError(null);
        const { error: authError } = await signIn(supabase, email, password);
        if (authError) {
            setError(authError.message);
            return;
        }
        const redirect = searchParams.get('redirect') ?? '/';
        router.push(redirect);
    }

    return <LoginForm onSubmit={handleLogin} error={error} />;
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginPageInner />
        </Suspense>
    );
}
