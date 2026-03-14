'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AddDeckForm } from '@sekel/community-components';
import { useAuth } from '../../context/AuthContext';
import './add.css';

export default function AddDeckPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.replace('/login?redirect=/add');
        }
    }, [user, loading, router]);

    if (loading || !user) return null;

    return (
        <div className="add-page">
            <div className="container">
                <AddDeckForm />
            </div>
        </div>
    );
}
