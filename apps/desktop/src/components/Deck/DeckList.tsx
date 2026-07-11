import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDecks, useBulkDeleteDecks } from '../../hooks/useDecks';
import { useDeckDueCounts, deckDueTotal } from '../../hooks/useDeckDueCounts';
import { useDeckClassificationCounts } from '../../hooks/useDeckClassificationCounts';
import { useDeckRetention, useDeckYieldMix, type DeckRetention, type DeckYield } from '../../hooks/useDeckMetrics';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useDeckEditor } from '../../contexts/DeckEditorContext';
import { Button, Loader, Modal, useToast } from '../UI';
import ImportAnkiButton from './ImportAnkiButton';
import { useAuthStore } from '../../stores/authStore';
import type { Deck } from '../../lib/types';
import type { DeckStats } from '../../lib/queries';
import './DeckList.css';

interface DeckNode {
    deck: Deck;
    children: DeckNode[];
}

// Exam-family filter chips (spec §7.3). Matched against the deck name as a
// heuristic — the schema has no exam-family column on decks yet.
const FAMILY_FILTERS = [
    { key: 'all', label: 'All', match: () => true },
    { key: 'usmle', label: 'USMLE Step 1', match: (n: string) => /usmle|step\s*1/i.test(n) },
    { key: 'nbme', label: 'NBME Shelf', match: (n: string) => /nbme|shelf/i.test(n) },
    { key: 'nclex', label: 'NCLEX-RN', match: (n: string) => /nclex/i.test(n) },
] as const;

const EMPTY_STATS: Pick<DeckStats, 'newCount' | 'newTotal' | 'learningCount' | 'reviewCount' | 'totalCount'> = {
    newCount: 0, newTotal: 0, learningCount: 0, reviewCount: 0, totalCount: 0,
};

function CountCell({ value, tone }: { value: number; tone: 'new' | 'learning' | 'due' }) {
    const cls = value === 0 ? 'count-zero' : `count-${tone}`;
    return <span className={cls}>{value}</span>;
}

/** Retention tint mirroring the app's accuracy palette (danger < 70 < warning < 85 < teal). */
function retentionColor(pct: number): string {
    if (pct < 70) return 'var(--danger)';
    if (pct < 85) return 'var(--warning)';
    return 'var(--teal)';
}

/**
 * Yield mix (spec §6): amber (high-yield) + teal (medium-yield) as proportions of
 * the deck's cards, over a slate track — the remaining track is low-yield +
 * unclassified. `total` is the deck's card count, so the bar reflects real coverage.
 */
function YieldMix({ high, medium, total, title }: { high: number; medium: number; total: number; title?: string }) {
    const denom = Math.max(total, 1);
    return (
        <span className="yield-mix" title={title}>
            <span className="yield-high" style={{ width: `${(high / denom) * 100}%` }} />
            <span className="yield-med" style={{ width: `${(medium / denom) * 100}%` }} />
        </span>
    );
}

export default function DeckList() {
    const { goToDeck, goToStudy } = useAppNavigation();
    const { openDeckEditor } = useDeckEditor();
    const { data: decks = [], isLoading, error } = useDecks();
    const { byDeck, totalDue, totalCards } = useDeckDueCounts();
    const { byDeck: classifiedByDeck, hasExam } = useDeckClassificationCounts();
    const retentionByDeck = useDeckRetention();
    const { byDeck: yieldByDeck, hasExam: hasYieldExam } = useDeckYieldMix();
    const bulkDelete = useBulkDeleteDecks();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const userId = useAuthStore((s) => s.user?.id);
    const queryClient = useQueryClient();
    const searchRef = useRef<HTMLInputElement>(null);

    // After an import the deck set + every deck's counts change; refresh the
    // decks-page queries so New/Due/retention/yield reflect the new data without
    // a manual reload (the import runs in the main process, so nothing else
    // invalidates the renderer cache). (SEKEL-138)
    const handleImportSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ['decks'] });
        queryClient.invalidateQueries({ queryKey: ['deckRetention'] });
        queryClient.invalidateQueries({ queryKey: ['deckYieldMix'] });
        queryClient.invalidateQueries({ queryKey: ['globalDueCount'] });
        showToast(t('decks.import_success', { defaultValue: 'Import complete' }), 'success');
    };

    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [classifiedCardCount, setClassifiedCardCount] = useState<number | null>(null);
    const [affectedPlans, setAffectedPlans] = useState<{ id: string; name: string }[]>([]);
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<string>('all');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Aggregate a subtree's counts so a parent row's numbers equal the sum of
    // its descendants + its own (spec §7.3: "child counts must sum to parent").
    const aggregate = useMemo(() => {
        const childrenOf = new Map<string | null, Deck[]>();
        decks.forEach((d) => {
            const arr = childrenOf.get(d.parent_id) ?? [];
            arr.push(d);
            childrenOf.set(d.parent_id, arr);
        });
        const memo = new Map<string, DeckStats>();
        const sum = (deckId: string): DeckStats => {
            if (memo.has(deckId)) return memo.get(deckId)!;
            const own = byDeck.get(deckId) ?? { deckId, ...EMPTY_STATS };
            const acc: DeckStats = { ...own };
            (childrenOf.get(deckId) ?? []).forEach((child) => {
                const c = sum(child.id);
                acc.newCount += c.newCount;
                acc.newTotal += c.newTotal;
                acc.learningCount += c.learningCount;
                acc.reviewCount += c.reviewCount;
                acc.totalCount += c.totalCount;
            });
            memo.set(deckId, acc);
            return acc;
        };
        return { childrenOf, sum };
    }, [decks, byDeck]);

    const tree: DeckNode[] = useMemo(() => {
        const build = (parentId: string | null): DeckNode[] =>
            (aggregate.childrenOf.get(parentId) ?? []).map((deck) => ({ deck, children: build(deck.id) }));
        return build(null);
    }, [aggregate]);

    const visibleTopLevel = useMemo(() => {
        const q = query.trim().toLowerCase();
        const fam = FAMILY_FILTERS.find((f) => f.key === family) ?? FAMILY_FILTERS[0];
        return tree.filter(({ deck }) => {
            if (q && !deck.name.toLowerCase().includes(q)) return false;
            if (!fam.match(deck.name)) return false;
            return true;
        });
    }, [tree, query, family]);

    const toggleDeckSelection = (deckId: string) => {
        const next = new Set(selectedDeckIds);
        if (next.has(deckId)) next.delete(deckId); else next.add(deckId);
        setSelectedDeckIds(next);
    };

    const toggleExpand = (deckId: string) => {
        const next = new Set(expanded);
        if (next.has(deckId)) next.delete(deckId); else next.add(deckId);
        setExpanded(next);
    };

    const handleBulkDeleteClick = () => {
        if (selectedDeckIds.size === 0) return;
        setClassifiedCardCount(null);
        setAffectedPlans([]);
        setShowDeleteConfirmation(true);
    };

    useEffect(() => {
        if (!showDeleteConfirmation || selectedDeckIds.size === 0) return;
        const ids = Array.from(selectedDeckIds);
        window.electronAPI.db.fetchBulkClassifiedCardCount(ids)
            .then(setClassifiedCardCount)
            .catch(() => setClassifiedCardCount(null));
        if (userId) {
            window.electronAPI.plan.fetchPlansReferencingDecks(userId, ids)
                .then(setAffectedPlans)
                .catch(() => setAffectedPlans([]));
        }
    }, [showDeleteConfirmation, selectedDeckIds, userId]);

    const confirmDelete = async () => {
        try {
            await bulkDelete.mutateAsync(Array.from(selectedDeckIds));
            setSelectedDeckIds(new Set());
            setIsDeleteMode(false);
            setShowDeleteConfirmation(false);
        } catch (_err) {
            showToast(t('errors.delete_decks'), 'error');
        }
    };

    // Decks keyboard: N = new deck, / = focus search (spec §8).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
            else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDeckEditor(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [openDeckEditor]);

    const estMinutes = Math.max(1, Math.round((totalDue * 11) / 60));

    if (isLoading) {
        return <div className="deck-list"><Loader center text={t('decks.loading')} /></div>;
    }
    if (error) {
        return <div className="deck-list"><div className="error">{t('decks.error')}</div></div>;
    }

    // Classified cards for a subtree (self + descendants), matching how the
    // count triad aggregates parent rows.
    const subtreeClassified = (deckId: string): number => {
        let acc = classifiedByDeck.get(deckId)?.classified ?? 0;
        (aggregate.childrenOf.get(deckId) ?? []).forEach((c) => { acc += subtreeClassified(c.id); });
        return acc;
    };

    // Retention/yield aggregate the same way. Retention sums raw numerators and
    // denominators over the subtree so the parent % is a true weighted average.
    const subtreeRetention = (deckId: string): DeckRetention => {
        const own = retentionByDeck.get(deckId) ?? { nonAgain: 0, total: 0 };
        const acc: DeckRetention = { ...own };
        (aggregate.childrenOf.get(deckId) ?? []).forEach((c) => {
            const r = subtreeRetention(c.id);
            acc.nonAgain += r.nonAgain; acc.total += r.total;
        });
        return acc;
    };
    const subtreeYield = (deckId: string): DeckYield => {
        const own = yieldByDeck.get(deckId) ?? { high: 0, medium: 0, low: 0 };
        const acc: DeckYield = { ...own };
        (aggregate.childrenOf.get(deckId) ?? []).forEach((c) => {
            const y = subtreeYield(c.id);
            acc.high += y.high; acc.medium += y.medium; acc.low += y.low;
        });
        return acc;
    };

    const renderRow = (node: DeckNode, depth: number): React.ReactNode[] => {
        const { deck, children } = node;
        const stats = depth === 0 ? aggregate.sum(deck.id) : (byDeck.get(deck.id) ?? { deckId: deck.id, ...EMPTY_STATS });
        const due = deckDueTotal(stats);
        const classified = !hasExam
            ? null
            : (depth === 0 ? subtreeClassified(deck.id) : (classifiedByDeck.get(deck.id)?.classified ?? 0));
        const retention = depth === 0 ? subtreeRetention(deck.id) : (retentionByDeck.get(deck.id) ?? { nonAgain: 0, total: 0 });
        const retentionPct = retention.total > 0 ? Math.round((retention.nonAgain / retention.total) * 100) : null;
        const yieldMix = depth === 0 ? subtreeYield(deck.id) : (yieldByDeck.get(deck.id) ?? { high: 0, medium: 0, low: 0 });
        const yieldUnclassified = Math.max(0, stats.totalCount - yieldMix.high - yieldMix.medium - yieldMix.low);
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(deck.id);
        const selected = selectedDeckIds.has(deck.id);

        const rows: React.ReactNode[] = [
            <div
                key={deck.id}
                className={`ink-row deck-row ${depth > 0 ? 'is-subdeck' : ''} ${selected ? 'is-selected' : ''}`}
                data-testid="deck-row"
            >
                <div className="deck-row__name">
                    {isDeleteMode && (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleDeckSelection(deck.id)}
                            aria-label={t('decks.select_deck', { defaultValue: 'Select deck' })}
                        />
                    )}
                    {hasChildren ? (
                        <button
                            className={`deck-chevron ${isExpanded ? 'is-open' : ''}`}
                            onClick={() => toggleExpand(deck.id)}
                            aria-label={isExpanded ? t('common.collapse', { defaultValue: 'Collapse' }) : t('common.expand', { defaultValue: 'Expand' })}
                        >
                            <ChevronRight size={15} />
                        </button>
                    ) : (
                        <span className="deck-chevron-spacer" />
                    )}
                    <button className="deck-row__title" onClick={() => goToDeck(deck.id)} title={deck.name}>
                        {deck.name}
                    </button>
                </div>
                <div className="deck-col num"><CountCell value={stats.newTotal} tone="new" /></div>
                <div className="deck-col num"><CountCell value={stats.learningCount} tone="learning" /></div>
                <div className="deck-col num"><CountCell value={stats.reviewCount} tone="due" /></div>
                <div className={`deck-col num mono ${classified == null || classified === 0 ? 'deck-muted' : ''}`}>
                    {classified == null ? '—' : classified}
                </div>
                <div
                    className={`deck-col num mono ${retentionPct == null ? 'deck-muted' : ''}`}
                    style={retentionPct != null ? { color: retentionColor(retentionPct) } : undefined}
                >
                    {retentionPct == null ? '—' : `${retentionPct}%`}
                </div>
                <div className="deck-col">
                    {hasYieldExam ? (
                        <YieldMix
                            high={yieldMix.high}
                            medium={yieldMix.medium}
                            total={stats.totalCount}
                            title={t('decks.yield_tooltip', {
                                defaultValue: 'High {{high}} · Med {{med}} · Low {{low}} · Unclassified {{unc}}',
                                high: yieldMix.high, med: yieldMix.medium, low: yieldMix.low, unc: yieldUnclassified,
                            })}
                        />
                    ) : (
                        <span className="deck-muted">—</span>
                    )}
                </div>
                <div className="deck-col mono deck-muted">—</div>
                <div className="deck-col deck-row__action">
                    {due > 0 ? (
                        <Button variant="primary" size="sm" onClick={() => goToStudy(deck.id)} data-testid="deck-study-btn">
                            {t('decks.study', { defaultValue: 'Study' })}
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={() => goToDeck(deck.id)}>
                            {t('decks.browse', { defaultValue: 'Browse' })}
                        </Button>
                    )}
                </div>
            </div>,
        ];

        if (hasChildren && isExpanded) {
            children.forEach((child) => rows.push(...renderRow(child, depth + 1)));
        }
        return rows;
    };

    return (
        <div className="deck-list">
            <div className="screen-header">
                <div>
                    <h1 className="page-title">{t('decks.your_decks')}</h1>
                    <p className="page-subtitle">
                        {t('decks.summary', {
                            defaultValue: '{{decks}} decks · {{cards}} cards · {{due}} due today',
                            decks: decks.length,
                            cards: totalCards.toLocaleString(),
                            due: totalDue,
                        })}
                    </p>
                </div>
                <div className="header-actions">
                    {!isDeleteMode ? (
                        <>
                            {decks.length > 0 && (
                                <Button variant="danger" onClick={() => setIsDeleteMode(true)} icon={<Trash2 size={16} />}>
                                    {t('decks.delete_decks')}
                                </Button>
                            )}
                            <ImportAnkiButton onSuccess={handleImportSuccess} />
                            <Button variant="primary" onClick={openDeckEditor} data-testid="create-deck-btn" icon={<Plus size={16} />}>
                                {t('decks.new_deck')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={() => { setIsDeleteMode(false); setSelectedDeckIds(new Set()); }} icon={<X size={16} />}>
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleBulkDeleteClick}
                                disabled={selectedDeckIds.size === 0 || bulkDelete.isPending}
                                isLoading={bulkDelete.isPending}
                                icon={!bulkDelete.isPending && <Trash2 size={16} />}
                            >
                                {bulkDelete.isPending ? t('common.deleting') : t('decks.delete_confirm', { count: selectedDeckIds.size })}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {decks.length === 0 ? (
                <div className="empty-v2" data-testid="empty-decks">
                    <p className="empty-v2__line">{t('decks.no_decks')}</p>
                    <Button variant="primary" size="lg" onClick={openDeckEditor} icon={<Plus size={16} />}>
                        {t('decks.create_deck')}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="screen-toolbar">
                        <div className="search-field deck-search">
                            <span className="search-icon">⌕</span>
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('decks.search_placeholder', { defaultValue: 'Search decks' })}
                                aria-label={t('decks.search_placeholder', { defaultValue: 'Search decks' })}
                            />
                            <span className="kbd">/</span>
                        </div>
                        {FAMILY_FILTERS.map((f) => (
                            <button
                                key={f.key}
                                className={`filter-chip ${family === f.key ? 'is-active' : ''}`}
                                onClick={() => setFamily(f.key)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="ink-table deck-table" data-testid="deck-grid">
                        <div className="ink-table-head deck-row">
                            <div className="ink-col-label">{t('decks.col_deck', { defaultValue: 'Deck' })}</div>
                            <div className="ink-col-label num">{t('decks.col_new', { defaultValue: 'New' })}</div>
                            <div className="ink-col-label num">{t('decks.col_learning', { defaultValue: 'Learning' })}</div>
                            <div className="ink-col-label num">{t('decks.col_due', { defaultValue: 'Due' })}</div>
                            <div className="ink-col-label num">{t('decks.col_classified', { defaultValue: 'Classified' })}</div>
                            <div className="ink-col-label num">{t('decks.col_retention', { defaultValue: 'Retention' })}</div>
                            <div className="ink-col-label">{t('decks.col_yield', { defaultValue: 'Yield mix' })}</div>
                            <div className="ink-col-label">{t('decks.col_last', { defaultValue: 'Last studied' })}</div>
                            <div className="ink-col-label" />
                        </div>
                        {visibleTopLevel.flatMap((node) => renderRow(node, 0))}
                    </div>

                    <div className="deck-footer">
                        <span>
                            {t('decks.footer_status', {
                                defaultValue: '{{due}} due across {{decks}} decks · est. {{min}} min at current pace',
                                due: totalDue,
                                decks: decks.length,
                                min: estMinutes,
                            })}
                        </span>
                        <span className="deck-footer__shortcuts">
                            <span className="kbd">↵</span> {t('decks.study', { defaultValue: 'Study' })}
                            <span className="kbd">N</span> {t('decks.new_deck')}
                            <span className="kbd">/</span> {t('common.search', { defaultValue: 'Search' })}
                        </span>
                    </div>
                </>
            )}

            <Modal
                isOpen={showDeleteConfirmation}
                onClose={() => setShowDeleteConfirmation(false)}
                title={t('decks.delete_decks')}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setShowDeleteConfirmation(false)}>{t('common.cancel')}</Button>
                        <Button variant="danger" onClick={confirmDelete} isLoading={bulkDelete.isPending}>{t('common.delete')}</Button>
                    </>
                }
            >
                <p>{t('decks.delete_message', { count: selectedDeckIds.size })}</p>
                <ul className="delete-warning-list">
                    <li>{t('decks.delete_warn_cards')}</li>
                    <li>{t('decks.delete_warn_reviews')}</li>
                    <li>
                        {classifiedCardCount !== null && classifiedCardCount > 0
                            ? t('decks.delete_warn_classifications_count', { count: classifiedCardCount })
                            : t('decks.delete_warn_classifications')}
                    </li>
                    <li>{t('decks.delete_warn_sessions')}</li>
                </ul>
                {affectedPlans.length > 0 && (
                    <div className="delete-plan-warning">
                        <p className="delete-plan-warning-title">{t('decks.delete_warn_plan_title', { count: affectedPlans.length })}</p>
                        <ul className="delete-plan-warning-list">
                            {affectedPlans.map(p => <li key={p.id}>{p.name}</li>)}
                        </ul>
                        <p className="text-muted">{t('decks.delete_warn_plan_detail')}</p>
                    </div>
                )}
                <p className="text-muted">{t('decks.delete_warn_irreversible')}</p>
            </Modal>
        </div>
    );
}
