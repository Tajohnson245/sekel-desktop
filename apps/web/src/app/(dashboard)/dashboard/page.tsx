'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Feedback } from '@sekel/db';

interface FeedbackWithProfile extends Feedback {
    user_profiles: {
        first_name: string | null;
        last_name: string | null;
    } | null;
}

export default function DashboardPage() {
    const router = useRouter();
    const [items, setItems] = useState<FeedbackWithProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuthAndFetch = async () => {
            const supabase = createBrowserClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.replace('/dashboard/login');
                return;
            }

            const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
            if (adminEmail && user.email !== adminEmail) {
                router.replace('/dashboard/login?error=unauthorized');
                return;
            }

            try {
                const res = await fetch('/dashboard/api/feedback');
                if (!res.ok) {
                    // Table may not exist yet or no data — treat as empty
                    setItems([]);
                } else {
                    const data = await res.json();
                    setItems(Array.isArray(data) ? data : []);
                }
            } catch {
                // Network error or table doesn't exist — show empty state
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        checkAuthAndFetch();
    }, [router]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: '#737373' }}>
                Loading...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fafafa' }}>
                    User Feedback
                </h1>
                <span style={{ fontSize: '0.875rem', color: '#737373' }}>
                    {items.length} {items.length === 1 ? 'entry' : 'entries'}
                </span>
            </div>

            {items.length === 0 && (
                <p style={{ color: '#737373', textAlign: 'center', padding: '3rem 0' }}>
                    No feedback submitted yet.
                </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {items.map(item => (
                    <FeedbackCard key={item.id} item={item} />
                ))}
            </div>
        </div>
    );
}

function FeedbackCard({ item }: { item: FeedbackWithProfile }) {
    const userName = item.user_profiles
        ? [item.user_profiles.first_name, item.user_profiles.last_name].filter(Boolean).join(' ') || 'Anonymous'
        : 'Anonymous';

    const date = new Date(item.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div style={{
            background: '#141414',
            border: '1px solid #262626',
            borderRadius: '0.75rem',
            padding: '1.25rem',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#d4d4d4' }}>{userName}</span>
                <span style={{ fontSize: '0.75rem', color: '#737373' }}>{date}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
                {item.areas.map(area => (
                    <span
                        key={area}
                        style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            background: '#1e293b',
                            color: '#93c5fd',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                        }}
                    >
                        {area}
                    </span>
                ))}
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.8125rem', color: '#737373', marginBottom: '0.25rem', fontWeight: 500 }}>Problem</p>
                <p style={{ fontSize: '0.875rem', color: '#d4d4d4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.description}</p>
            </div>

            {item.screenshot_url && (
                <div style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.8125rem', color: '#737373', marginBottom: '0.375rem', fontWeight: 500 }}>Screenshot</p>
                    <a href={item.screenshot_url} target="_blank" rel="noopener noreferrer">
                        <img
                            src={item.screenshot_url}
                            alt="Feedback screenshot"
                            style={{
                                maxWidth: '400px',
                                maxHeight: '250px',
                                borderRadius: '0.5rem',
                                border: '1px solid #262626',
                            }}
                        />
                    </a>
                </div>
            )}

            {item.desired_fix && (
                <div>
                    <p style={{ fontSize: '0.8125rem', color: '#737373', marginBottom: '0.25rem', fontWeight: 500 }}>Desired Fix</p>
                    <p style={{ fontSize: '0.875rem', color: '#d4d4d4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.desired_fix}</p>
                </div>
            )}
        </div>
    );
}
