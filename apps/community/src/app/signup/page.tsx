'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignupForm } from '@sekel/community-components';
import { signUp } from '@sekel/db';
import { supabase } from '../../lib/supabase';

export default function SignupPage() {
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function handleSignup(email: string, password: string) {
        setError(null);
        const { error: authError } = await signUp(supabase, email, password);
        if (authError) {
            setError(authError.message);
            return;
        }
        router.push('/');
    }

    return <SignupForm onSubmit={handleSignup} error={error} />;
}
