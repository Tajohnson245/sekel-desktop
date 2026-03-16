'use client';

import { DeckDetail } from '@sekel/community-components';
import type { Deck } from '@sekel/community-components';
import { useAuth } from '../context/AuthContext';

interface DeckDetailWrapperProps {
    deck: Deck;
}

export default function DeckDetailWrapper({ deck }: DeckDetailWrapperProps) {
    const { user } = useAuth();
    return <DeckDetail deck={deck} isAuthenticated={!!user} />;
}
