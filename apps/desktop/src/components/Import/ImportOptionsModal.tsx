import './Import.css';
import { useState, useCallback, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Select } from '../UI';
import {
    buildInitialDeckStates,
    toggleParentDecks,
    buildPayload,
    applyHierarchyMode,
    resolveLeafNames,
} from '../../main/import/importOptionsLogic';
import type { DeckState, HierarchyMode } from '../../main/import/importOptionsLogic';
import type {
    ImportSummary,
    ImportSummaryDeck,
    ImportOptionsPayload,
} from '../../types/electron';

// Re-export pure helpers so external consumers can import from a single location
export { toggleParentDecks, buildPayload } from '../../main/import/importOptionsLogic';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportOptionsModalProps {
    isOpen: boolean;
    summary: ImportSummary;
    mediaMap: Record<string, string>;
    mediaFilePaths: string[];
    tempDir: string;
    onConfirm: (payload: Omit<ImportOptionsPayload, 'userId'>) => Promise<void>;
    onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract root name — the first component of a "A::B::C" hierarchy. */
function rootName(deck: ImportSummaryDeck): string {
    return deck.nameComponents[0];
}

/** True if this deck is a child (has more than one name component). */
function isChild(deck: ImportSummaryDeck): boolean {
    return deck.nameComponents.length > 1;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryChip({ label, count }: { label: string; count: number }) {
    return (
        <div className="import-summary-chip">
            <span className="import-summary-count">{count.toLocaleString()}</span>
            <span className="import-summary-label">{label}</span>
        </div>
    );
}

function OverwriteConfirm({
    deckName,
    onCancel,
    onConfirm,
}: {
    deckName: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="import-overwrite-confirm">
            <AlertTriangle size={16} className="import-overwrite-icon" />
            <p>{t('import.overwriteConfirm', { name: deckName })}</p>
            <div className="import-overwrite-actions">
                <Button variant="secondary" size="sm" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button variant="danger" size="sm" onClick={onConfirm}>
                    {t('import.confirmOverwrite')}
                </Button>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ImportOptionsModal({
    isOpen,
    summary,
    mediaMap,
    mediaFilePaths,
    tempDir,
    onConfirm,
    onCancel,
}: ImportOptionsModalProps) {
    const { t } = useTranslation();

    const [deckStates, setDeckStates] = useState<Map<number, DeckState>>(
        () => buildInitialDeckStates(summary.decks),
    );
    const [overwriteConfirmId, setOverwriteConfirmId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hierarchyMode, setHierarchyMode] = useState<HierarchyMode>('subdecks');

    // Detect if the import contains subdecks
    const hasSubdecks = useMemo(
        () => summary.decks.some(d => d.nameComponents.length > 1),
        [summary.decks],
    );

    // Leaf names for individual mode display
    const leafNames = useMemo(
        () => resolveLeafNames(summary.decks),
        [summary.decks],
    );

    // Group decks by root name for tree rendering (subdecks mode)
    const deckTree = useMemo(() => {
        const rootOrder: string[] = [];
        const childrenByRoot = new Map<string, ImportSummaryDeck[]>();
        const rootDecks = new Map<string, ImportSummaryDeck>();

        for (const d of summary.decks) {
            const root = rootName(d);
            if (!isChild(d)) {
                rootDecks.set(root, d);
                rootOrder.push(root);
            } else {
                if (!childrenByRoot.has(root)) childrenByRoot.set(root, []);
                childrenByRoot.get(root)!.push(d);
            }
        }

        // Also handle decks that only appear as children (no explicit root deck in the list)
        for (const d of summary.decks) {
            const root = rootName(d);
            if (isChild(d) && !rootDecks.has(root)) {
                // The root deck was filtered (e.g., id=1), but children remain
                // Show children without a parent row
                if (!rootOrder.includes(root)) rootOrder.push(root);
            }
        }

        return { rootOrder, rootDecks, childrenByRoot };
    }, [summary.decks]);

    const selectedCount = useMemo(
        () => Array.from(deckStates.values()).filter(s => s.selected).length,
        [deckStates],
    );

    const canImport = selectedCount >= 1 && !isSubmitting;

    // ── State updaters ────────────────────────────────────────────────────────

    function updateDeck(id: number, patch: Partial<DeckState>) {
        setDeckStates(prev => {
            const next = new Map(prev);
            next.set(id, { ...prev.get(id)!, ...patch });
            return next;
        });
    }

    function handleParentToggle(root: string, selected: boolean) {
        setDeckStates(prev => toggleParentDecks(summary.decks, prev, root, selected));
    }

    function handleConflictChange(deck: ImportSummaryDeck, value: string) {
        if (value === 'overwrite') {
            setOverwriteConfirmId(deck.ankiDeckId);
        } else {
            updateDeck(deck.ankiDeckId, { conflict: value as 'skip' | 'merge' });
        }
    }

    function handleOverwriteCancel() {
        // Revert to skip
        if (overwriteConfirmId !== null) {
            updateDeck(overwriteConfirmId, { conflict: 'skip' });
        }
        setOverwriteConfirmId(null);
    }

    function handleOverwriteConfirm() {
        if (overwriteConfirmId !== null) {
            updateDeck(overwriteConfirmId, { conflict: 'overwrite' });
        }
        setOverwriteConfirmId(null);
    }

    function handleHierarchyModeChange(mode: HierarchyMode) {
        setHierarchyMode(mode);
        setDeckStates(prev => applyHierarchyMode(summary.decks, prev, mode));
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleConfirm = useCallback(async () => {
        setIsSubmitting(true);
        try {
            const payload = buildPayload(summary, deckStates, hierarchyMode, mediaMap, mediaFilePaths, tempDir);
            await onConfirm(payload);
        } finally {
            setIsSubmitting(false);
        }
    }, [summary, deckStates, hierarchyMode, mediaMap, mediaFilePaths, tempDir, onConfirm]);

    // ── Render helpers ────────────────────────────────────────────────────────

    const schedulingOptions = [
        { value: 'keep', label: t('import.deckOptions.keepProgress') },
        { value: 'fresh', label: t('import.deckOptions.startFresh') },
    ];

    const algorithmOptions = [
        { value: 'fsrs', label: t('import.deckOptions.fsrs') },
        { value: 'sm2', label: t('import.deckOptions.sm2') },
    ];

    const conflictOptions = [
        { value: 'skip', label: t('import.deckOptions.skip') },
        { value: 'overwrite', label: t('import.deckOptions.overwrite') },
        { value: 'merge', label: t('import.deckOptions.merge') },
    ];

    /** Get the display name for a deck based on the current hierarchy mode. */
    function displayName(deck: ImportSummaryDeck, depth: number): string {
        if (hierarchyMode === 'individual') {
            return leafNames.get(deck.ankiDeckId) ?? deck.name;
        }
        // Subdecks mode: root shows first component, children show remainder
        return depth === 0
            ? deck.nameComponents[0]
            : deck.nameComponents.slice(1).join('::');
    }

    function renderDeckRow(deck: ImportSummaryDeck, depth: number) {
        const state = deckStates.get(deck.ankiDeckId)!;
        const children = depth === 0 ? (deckTree.childrenByRoot.get(rootName(deck)) ?? []) : [];
        const hasChildren = children.length > 0;
        const isOverwritePending = overwriteConfirmId === deck.ankiDeckId;
        const isIndividual = hierarchyMode === 'individual';

        return (
            <div key={deck.ankiDeckId}>
                <div
                    className="import-deck-row"
                    style={{ paddingLeft: depth === 0 ? 0 : 24 }}
                >
                    {/* Expand/collapse toggle for parents with children (subdecks mode only) */}
                    {!isIndividual && depth === 0 && hasChildren ? (
                        <button
                            className="btn-icon import-deck-expand"
                            onClick={() => updateDeck(deck.ankiDeckId, { expanded: !state.expanded })}
                            aria-label={state.expanded ? t('common.collapse') : t('common.expand')}
                        >
                            {state.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    ) : (
                        <span className="import-deck-expand-placeholder" />
                    )}

                    {/* Checkbox */}
                    <input
                        type="checkbox"
                        id={`deck-${deck.ankiDeckId}`}
                        checked={state.selected}
                        onChange={e => {
                            if (!isIndividual && depth === 0 && hasChildren) {
                                handleParentToggle(rootName(deck), e.target.checked);
                            } else {
                                updateDeck(deck.ankiDeckId, { selected: e.target.checked });
                            }
                        }}
                        className="import-deck-checkbox"
                    />

                    {/* Deck name */}
                    <label
                        htmlFor={`deck-${deck.ankiDeckId}`}
                        className="import-deck-name"
                    >
                        {displayName(deck, depth)}
                        {deck.hasConflict && (
                            <span className="import-conflict-badge">{t('import.conflictBadge')}</span>
                        )}
                    </label>

                    {/* Per-deck controls (only when selected) */}
                    {state.selected && (
                        <div className="import-deck-controls">
                            <Select
                                options={schedulingOptions}
                                value={state.scheduling}
                                onChange={e => updateDeck(deck.ankiDeckId, { scheduling: e.target.value as 'keep' | 'fresh' })}
                                aria-label={t('import.deckOptions.scheduling')}
                                containerClassName="import-deck-select"
                            />
                            <Select
                                options={algorithmOptions}
                                value={state.algorithm}
                                onChange={e => updateDeck(deck.ankiDeckId, { algorithm: e.target.value as 'fsrs' | 'sm2' })}
                                aria-label={t('import.deckOptions.algorithm')}
                                containerClassName="import-deck-select"
                            />
                            {deck.hasConflict && (
                                <Select
                                    options={conflictOptions}
                                    value={state.conflict ?? 'skip'}
                                    onChange={e => handleConflictChange(deck, e.target.value)}
                                    aria-label={t('import.deckOptions.conflict')}
                                    containerClassName="import-deck-select"
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Inline overwrite confirmation */}
                {isOverwritePending && (
                    <OverwriteConfirm
                        deckName={deck.name}
                        onCancel={handleOverwriteCancel}
                        onConfirm={handleOverwriteConfirm}
                    />
                )}

                {/* Children (expanded, subdecks mode only) */}
                {!isIndividual && depth === 0 && hasChildren && state.expanded &&
                    children.map(child => renderDeckRow(child, 1))}
            </div>
        );
    }

    const hasConflicts = summary.decks.some(d => d.hasConflict);
    const conflictCount = summary.decks.filter(d => d.hasConflict).length;

    const footer = (
        <>
            <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                {t('common.cancel')}
            </Button>
            <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={!canImport}
                isLoading={isSubmitting}
            >
                {t('import.importButton', { count: selectedCount })}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={t('import.modalTitle')}
            size="lg"
            footer={footer}
        >
            {/* ── Summary panel ── */}
            <div className="import-summary-panel">
                <div className="import-summary-chips">
                    <SummaryChip label={t('import.summary.decks', { count: summary.deckCount })} count={summary.deckCount} />
                    <SummaryChip label={t('import.summary.noteTypes', { count: summary.noteTypeCount })} count={summary.noteTypeCount} />
                    <SummaryChip label={t('import.summary.notes', { count: summary.noteCount })} count={summary.noteCount} />
                    <SummaryChip label={t('import.summary.cards', { count: summary.cardCount })} count={summary.cardCount} />
                    {summary.reviewLogCount > 0 && (
                        <SummaryChip label={t('import.summary.reviews', { count: summary.reviewLogCount })} count={summary.reviewLogCount} />
                    )}
                    {summary.mediaImageCount > 0 && (
                        <SummaryChip label={t('import.summary.images', { count: summary.mediaImageCount })} count={summary.mediaImageCount} />
                    )}
                    {summary.mediaAudioCount > 0 && (
                        <SummaryChip label={t('import.summary.audio', { count: summary.mediaAudioCount })} count={summary.mediaAudioCount} />
                    )}
                </div>
                {summary.warnings.length > 0 && (
                    <div className="import-warnings">
                        <AlertTriangle size={14} />
                        <span>{t('import.warnings', { count: summary.warnings.length })}</span>
                        <ul className="import-warnings-list">
                            {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            {/* ── Hierarchy mode toggle (only when subdecks exist) ── */}
            {hasSubdecks && (
                <div className="import-hierarchy-toggle">
                    <span className="import-hierarchy-label">{t('import.hierarchyMode.label')}</span>
                    <div className="import-hierarchy-options">
                        <button
                            className={`import-hierarchy-option ${hierarchyMode === 'subdecks' ? 'active' : ''}`}
                            onClick={() => handleHierarchyModeChange('subdecks')}
                        >
                            {t('import.hierarchyMode.subdecks')}
                        </button>
                        <button
                            className={`import-hierarchy-option ${hierarchyMode === 'individual' ? 'active' : ''}`}
                            onClick={() => handleHierarchyModeChange('individual')}
                        >
                            {t('import.hierarchyMode.individual')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Conflict banner ── */}
            {hasConflicts && (
                <div className="import-conflict-banner">
                    <AlertTriangle size={14} />
                    {t('import.conflictWarning', { count: conflictCount })}
                </div>
            )}

            {/* ── Column headers ── */}
            <div className="import-deck-header">
                <span className="import-deck-header-name">{t('import.deckOptions.deck')}</span>
                <span className="import-deck-header-controls">
                    <span>{t('import.deckOptions.scheduling')}</span>
                    <span>{t('import.deckOptions.algorithm')}</span>
                    {hasConflicts && <span>{t('import.deckOptions.conflict')}</span>}
                </span>
            </div>

            {/* ── Deck tree / flat list ── */}
            <div className="import-deck-list">
                {hierarchyMode === 'individual'
                    ? summary.decks.map(deck => renderDeckRow(deck, 0))
                    : deckTree.rootOrder.map(root => {
                        const rootDeck = deckTree.rootDecks.get(root);
                        if (rootDeck) {
                            return renderDeckRow(rootDeck, 0);
                        }
                        // Root was filtered out; show orphan children at depth 0
                        return (deckTree.childrenByRoot.get(root) ?? []).map(child =>
                            renderDeckRow(child, 0),
                        );
                    })
                }
            </div>

            {selectedCount === 0 && (
                <p className="import-at-least-one">{t('import.atLeastOne')}</p>
            )}
        </Modal>
    );
}
