'use client';

import { useRouter } from 'next/navigation';
import { CommunityNavbar } from '@sekel/community-components';
import { signOut } from '@sekel/db';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function NavbarWrapper() {
    const { user } = useAuth();
    const router = useRouter();

    async function handleSignOut() {
        await signOut(supabase);
        router.push('/');
    }

    return <CommunityNavbar user={user} onSignOut={handleSignOut} />;
}
