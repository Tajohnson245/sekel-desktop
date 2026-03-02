import { useState } from 'react';
import { useTranslation } from '../../../node_modules/react-i18next';
import { useCreateDeck, useUpdateDeck } from '../../hooks/useDecks';
import type { Deck } from '../../lib/types';
import { Button, Input, Modal } from '../UI';

interface DeckEditorProps {
    deck?: Deck | null;
    userId: string;
    onClose: () => void;
    onSuccess?: (deck: Deck) => void;
}

export default function DeckEditor({ deck, userId, onClose, onSuccess }: DeckEditorProps) {
    const { t } = useTranslation();
    const [name, setName] = useState(deck?.name ?? '');
    const [description, setDescription] = useState(deck?.description ?? '');
    const [error, setError] = useState<string | null>(null);

    const createDeck = useCreateDeck();
    const updateDeck = useUpdateDeck();

    const isEditing = !!deck;
    const isLoading = createDeck.isPending || updateDeck.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError(t('modals.error_deck_name'));
            return;
        }

        try {
            let result: Deck;
            if (isEditing && deck) {
                result = await updateDeck.mutateAsync({
                    id: deck.id,
                    updates: { name: name.trim(), description: description.trim() || null },
                });
            } else {
                result = await createDeck.mutateAsync({
                    user_id: userId,
                    name: name.trim(),
                    description: description.trim() || null,
                    fsrs_enabled: true,
                });
            }

            if (onSuccess) {
                onSuccess(result);
            }

            onClose();
        } catch (_err) {
            setError(t('modals.error_save_deck'));
        }
    };

    const footer = (
        <>
            <Button
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
            >
                {t('common.cancel')}
            </Button>
            <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isLoading}
                isLoading={isLoading}
                data-testid="deck-editor-submit"
            >
                {isEditing ? t('common.save') : t('modals.create')}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={isEditing ? t('modals.edit_deck_title') : t('modals.create_deck_title')}
            footer={footer}
            size="md"
        >
            <form onSubmit={handleSubmit} data-testid="deck-editor-modal">
                <Input
                    label={t('modals.deck_name')}
                    id="deck-name"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    placeholder={t('modals.deck_name_placeholder')}
                    autoFocus
                    data-testid="deck-name-input"
                    disabled={isLoading}
                />

                <Input
                    label={t('modals.deck_desc')}
                    id="deck-description"
                    multiline
                    rows={3}
                    value={description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                    placeholder={t('modals.deck_desc_placeholder')}
                    data-testid="deck-description-input"
                    disabled={isLoading}
                />

                {error && (
                    <div className="form-error" data-testid="deck-editor-error">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}
