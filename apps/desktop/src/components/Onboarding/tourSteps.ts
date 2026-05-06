export type TourStepRoute =
    | { kind: 'dashboard' }
    | { kind: 'documents' }
    | { kind: 'plan' }
    | { kind: 'decks' }
    | { kind: 'imageOcclusion' }
    | { kind: 'drafts' }
    | { kind: 'statistics' }
    | { kind: 'profile'; tab?: string };

/**
 * Snapshot of the user's data used to decide which tour steps are relevant.
 * Steps that depend on data the user doesn't yet have are filtered out at
 * tour-start time so we don't spotlight empty regions of the UI.
 */
export interface TourContext {
    hasDecks: boolean;
    hasActivePlan: boolean;
    hasIntelligence: boolean;
    /** True when the dashboard's Exam Readiness section actually renders:
     *  user has an exam date, classifications exist, and at least one
     *  system has data. */
    hasExamReadiness: boolean;
    /** True when the active plan's snapshot has at least one system covered —
     *  i.e. the user has classified cards. Without it the System Coverage
     *  card on /plan never renders. */
    hasSystemCoverage: boolean;
}

/**
 * Step definition. Title and body live in the i18n files at
 * `onboarding.steps.<id>.{title,body}` — keep step IDs in sync.
 */
export interface TourStep {
    id: string;
    route: TourStepRoute;
    targetSelector?: string;
    /** Return false to omit this step (e.g., feature has no data yet). */
    precondition?: (ctx: TourContext) => boolean;
}

export const TOUR_STEPS: TourStep[] = [
    {
        id: 'dashboard-hero',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-hero-row"]',
    },
    {
        id: 'dashboard-intelligence',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-intelligence"]',
        precondition: (c) => c.hasIntelligence,
    },
    {
        id: 'dashboard-plan-overview',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-plan-overview"]',
    },
    {
        id: 'dashboard-deck-health',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-deck-health"]',
        precondition: (c) => c.hasDecks,
    },
    {
        id: 'dashboard-exam-readiness',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-exam-readiness"]',
        precondition: (c) => c.hasExamReadiness,
    },
    {
        id: 'dashboard-quick-actions',
        route: { kind: 'dashboard' },
        targetSelector: '[data-tour-id="dashboard-quick-actions"]',
    },
    {
        id: 'documents-upload',
        route: { kind: 'documents' },
        targetSelector: '[data-tour-id="documents-upload-zone"]',
    },
    {
        id: 'plan-targets',
        route: { kind: 'plan' },
        targetSelector: '[data-tour-id="plan-targets"]',
        precondition: (c) => c.hasActivePlan,
    },
    {
        id: 'plan-activity',
        route: { kind: 'plan' },
        targetSelector: '[data-tour-id="plan-activity"]',
        precondition: (c) => c.hasActivePlan,
    },
    {
        id: 'plan-weekly-workload',
        route: { kind: 'plan' },
        targetSelector: '[data-tour-id="plan-weekly-workload"]',
        precondition: (c) => c.hasActivePlan,
    },
    {
        id: 'plan-system-coverage',
        route: { kind: 'plan' },
        targetSelector: '[data-tour-id="plan-system-coverage"]',
        precondition: (c) => c.hasSystemCoverage,
    },
    {
        id: 'decks',
        route: { kind: 'decks' },
        precondition: (c) => c.hasDecks,
    },
    {
        id: 'image-occlusion',
        route: { kind: 'imageOcclusion' },
        targetSelector: '[data-tour-id="occlusion-canvas"]',
    },
    {
        id: 'drafts',
        route: { kind: 'drafts' },
    },
    {
        id: 'statistics',
        route: { kind: 'statistics' },
        targetSelector: '[data-tour-id="statistics-page"]',
    },
    {
        id: 'profile-info',
        route: { kind: 'profile', tab: 'profile' },
    },
    {
        id: 'profile-preferences',
        route: { kind: 'profile', tab: 'preferences' },
    },
    {
        id: 'profile-study',
        route: { kind: 'profile', tab: 'study' },
    },
    {
        id: 'profile-backup',
        route: { kind: 'profile', tab: 'backup' },
    },
    {
        id: 'profile-account',
        route: { kind: 'profile', tab: 'account' },
    },
];

export function visibleStepIdsFor(ctx: TourContext): string[] {
    return TOUR_STEPS.filter((s) => !s.precondition || s.precondition(ctx)).map((s) => s.id);
}

export function findStep(id: string): TourStep | undefined {
    return TOUR_STEPS.find((s) => s.id === id);
}
