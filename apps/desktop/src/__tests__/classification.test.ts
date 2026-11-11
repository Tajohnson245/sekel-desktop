import { describe, it, expect } from 'vitest';
import {
    RELEVANCE_THRESHOLD,
    buildClassificationMessages,
    buildScreeningMessages,
    cardTextFromFields,
    cleanCardText,
    formatTaxonomy,
    isConfidentlyMapped,
    isDeckRelevant,
    parseClassificationResponse,
    parseJsonObject,
    parseScreeningResponse,
    pickEvenlySpaced,
    type TaxonomySystem,
} from '../main/ai/classification';

const TAXONOMY: TaxonomySystem[] = [
    {
        system_key: 'cardio',
        label: 'Cardiovascular',
        topics: [
            { topic_key: 'heart-failure', label: 'Heart Failure' },
            { topic_key: 'arrhythmia', label: 'Arrhythmias' },
        ],
    },
    {
        system_key: 'multisystem',
        label: 'Multisystem Processes',
        topics: [{ topic_key: 'cell-biology', label: 'Cell Biology' }],
    },
    { system_key: 'psych', label: 'Psychiatry', topics: [] },
];

describe('cleanCardText', () => {
    it('strips HTML, sound tags and entities, and keeps image markers', () => {
        expect(cleanCardText('<b>Mitral</b>&nbsp;stenosis<br>murmur [sound:a.mp3]<img src="x.png">'))
            .toBe('Mitral stenosis murmur [image]');
        expect(cleanCardText('A &amp; B &lt;3 &#39;x&#39; &#x2192;')).toBe("A & B <3 'x' →");
    });

    it('unwraps cloze deletions, with or without hints', () => {
        expect(cleanCardText('The {{c1::garbage collector}} frees {{c2::heap::where?}} memory'))
            .toBe('The garbage collector frees heap memory');
    });

    it('truncates long text', () => {
        const out = cleanCardText('a'.repeat(50), 10);
        expect(out).toHaveLength(10);
        expect(out.endsWith('…')).toBe(true);
    });
});

describe('cardTextFromFields', () => {
    it('uses Front as front and every other field as back', () => {
        expect(cardTextFromFields(JSON.stringify({ Front: 'Q?', Back: 'A', Extra: 'more' })))
            .toEqual({ front: 'Q?', back: 'A / more' });
    });

    it('handles cloze notes (Text + Back Extra)', () => {
        expect(cardTextFromFields({ Text: '{{c1::Digoxin}} inhibits Na/K ATPase', 'Back Extra': '' }))
            .toEqual({ front: 'Digoxin inhibits Na/K ATPase', back: '' });
    });

    it('falls back to the first field, and to raw text when fields are not JSON', () => {
        expect(cardTextFromFields(JSON.stringify({ Question: 'Q', Answer: 'A' }))).toEqual({ front: 'Q', back: 'A' });
        expect(cardTextFromFields('not json')).toEqual({ front: 'not json', back: '' });
    });
});

describe('pickEvenlySpaced', () => {
    it('returns every index when the sample is larger than the deck', () => {
        expect(pickEvenlySpaced(3, 25)).toEqual([0, 1, 2]);
    });

    it('spreads the sample over the whole deck', () => {
        const picks = pickEvenlySpaced(1000, 25);
        expect(picks).toHaveLength(25);
        expect(new Set(picks).size).toBe(25);
        expect(picks[0]).toBeLessThan(40);
        expect(picks[24]).toBeGreaterThan(960);
        expect([...picks].sort((a, b) => a - b)).toEqual(picks);
    });

    it('handles empty input', () => {
        expect(pickEvenlySpaced(0, 25)).toEqual([]);
        expect(pickEvenlySpaced(10, 0)).toEqual([]);
    });
});

describe('prompts', () => {
    const cards = [
        { front: 'What does the garbage collector do in .NET?', back: 'Frees unreachable heap objects' },
        { front: 'S3 gallop suggests?', back: 'Heart failure' },
    ];

    it('screening prompt names the exam, its scope, the deck and numbers every card', () => {
        const [system, user] = buildScreeningMessages({
            examLabel: 'USMLE Step 1',
            scope: ['Cardiovascular', 'Multisystem Processes'],
            deckName: 'C# Fundamentals',
            cards,
        });
        expect(system.role).toBe('system');
        expect(system.content).toContain('USMLE Step 1');
        expect(system.content).toContain('Cardiovascular; Multisystem Processes');
        expect(system.content).toMatch(/not by individual words/i);
        expect(user.content).toContain('Deck name: "C# Fundamentals"');
        expect(user.content).toContain('[1] FRONT: What does the garbage collector do in .NET?');
        expect(user.content).toContain('[2] FRONT: S3 gallop suggests?');
    });

    it('classification prompt lists only blueprint keys and asks for exam_relevant first', () => {
        const [system, user] = buildClassificationMessages({
            examLabel: 'USMLE Step 1', deckName: 'Cardio', taxonomy: TAXONOMY, cards,
        });
        expect(system.content).toContain('cardio — Cardiovascular');
        expect(system.content).toContain('    heart-failure: Heart Failure');
        expect(system.content).toContain('psych — Psychiatry\n    (no topics: use topic_key null)');
        expect(system.content).toContain('"exam_relevant"');
        expect(user.content).toContain('Deck name: "Cardio"');
    });

    it('formats the taxonomy compactly', () => {
        expect(formatTaxonomy(TAXONOMY).split('\n')).toHaveLength(7);
    });
});

describe('parseJsonObject', () => {
    it('accepts plain JSON, fenced JSON and JSON with stray text', () => {
        expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
        expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJsonObject('Here: {"a":1} done')).toEqual({ a: 1 });
    });

    it('rejects arrays, garbage and empty input', () => {
        expect(parseJsonObject('[1,2]')).toBeNull();
        expect(parseJsonObject('nope')).toBeNull();
        expect(parseJsonObject(null)).toBeNull();
    });
});

describe('parseScreeningResponse', () => {
    it('counts one verdict per card and reads the subject', () => {
        const raw = JSON.stringify({
            deck_subject: 'C# programming',
            cards: [
                { card: 1, relevant: false },
                { card: 2, relevant: true },
                { card: 2, relevant: false }, // duplicate: first wins
                { card: 9, relevant: true },  // out of range
                { card: 3, relevant: 'yes' }, // not a boolean
            ],
        });
        expect(parseScreeningResponse(raw, 3)).toEqual({ judged: 2, relevant: 1, subject: 'C# programming' });
    });

    it('returns null for unusable replies', () => {
        expect(parseScreeningResponse('garbage', 3)).toBeNull();
        expect(parseScreeningResponse('{"cards": []}', 3)).toBeNull();
        expect(parseScreeningResponse('{"cards": "x"}', 3)).toBeNull();
    });
});

describe('isDeckRelevant', () => {
    it(`uses a ${RELEVANCE_THRESHOLD * 100}% threshold`, () => {
        expect(isDeckRelevant({ judged: 25, relevant: 1 })).toBe(false);
        expect(isDeckRelevant({ judged: 25, relevant: 7 })).toBe(false);
        expect(isDeckRelevant({ judged: 25, relevant: 8 })).toBe(true);
        expect(isDeckRelevant({ judged: 25, relevant: 25 })).toBe(true);
    });
});

describe('parseClassificationResponse', () => {
    const reply = (results: unknown[]) => JSON.stringify({ results });

    it('maps relevant cards and marks off-exam ones', () => {
        const out = parseClassificationResponse(reply([
            { card: 1, exam_relevant: true, classifications: [{ system_key: 'cardio', topic_key: 'heart-failure', confidence: 0.9, split_weight: 1 }] },
            { card: 2, exam_relevant: false, classifications: [{ system_key: 'multisystem', topic_key: 'cell-biology', confidence: 0.9, split_weight: 1 }] },
        ]), 2, TAXONOMY);
        expect(out[0]).toEqual({
            kind: 'mapped',
            classifications: [{ systemKey: 'cardio', topicKey: 'heart-failure', confidence: 0.9, splitWeight: 1 }],
        });
        expect(out[1]).toEqual({ kind: 'off_exam' });
    });

    it('drops unknown systems and topics that belong to another system', () => {
        const out = parseClassificationResponse(reply([
            { card: 1, exam_relevant: true, classifications: [
                { system_key: 'other', topic_key: null, confidence: 0.2, split_weight: 0.5 },
                { system_key: 'cardio', topic_key: 'cell-biology', confidence: 0.8, split_weight: 0.5 },
            ] },
            { card: 2, exam_relevant: true, classifications: [{ system_key: 'made-up', confidence: 0.9, split_weight: 1 }] },
        ]), 2, TAXONOMY);
        expect(out[0]).toEqual({
            kind: 'mapped',
            classifications: [{ systemKey: 'cardio', topicKey: null, confidence: 0.8, splitWeight: 1 }],
        });
        expect(out[1]).toEqual({ kind: 'invalid', reason: 'no valid blueprint system' });
    });

    it('merges duplicate systems, rescales split weights and keeps at most three', () => {
        const out = parseClassificationResponse(reply([
            { card: 1, exam_relevant: true, classifications: [
                { system_key: 'cardio', topic_key: 'arrhythmia', confidence: 0.6, split_weight: 2 },
                { system_key: 'cardio', topic_key: 'heart-failure', confidence: 0.9, split_weight: 2 },
                { system_key: 'multisystem', topic_key: 'cell-biology', confidence: 1.4, split_weight: 1 },
                { system_key: 'psych', topic_key: 'anything', confidence: -1, split_weight: 0 },
            ] },
        ]), 1, TAXONOMY);
        expect(out[0].kind).toBe('mapped');
        if (out[0].kind !== 'mapped') return;
        const [first, second, third] = out[0].classifications;
        expect(first).toEqual({ systemKey: 'cardio', topicKey: 'heart-failure', confidence: 0.9, splitWeight: 0.8 });
        expect(second).toEqual({ systemKey: 'multisystem', topicKey: 'cell-biology', confidence: 1, splitWeight: 0.2 });
        expect(third).toEqual({ systemKey: 'psych', topicKey: null, confidence: 0, splitWeight: 0 });
        const total = out[0].classifications.reduce((s, c) => s + c.splitWeight, 0);
        expect(total).toBeCloseTo(1);
    });

    it('marks missing cards and missing verdicts as invalid', () => {
        const out = parseClassificationResponse(reply([
            { card: 2, classifications: [] },
        ]), 3, TAXONOMY);
        expect(out).toEqual([
            { kind: 'invalid', reason: 'missing from reply' },
            { kind: 'invalid', reason: 'no exam_relevant verdict' },
            { kind: 'invalid', reason: 'missing from reply' },
        ]);
    });

    it('marks every card invalid when the reply is unreadable', () => {
        expect(parseClassificationResponse('sorry, I cannot', 2, TAXONOMY))
            .toEqual([{ kind: 'invalid', reason: 'unreadable reply' }, { kind: 'invalid', reason: 'unreadable reply' }]);
    });
});

describe('isConfidentlyMapped', () => {
    it('needs a mapped classification at or above the yield confidence floor', () => {
        expect(isConfidentlyMapped({ kind: 'off_exam' })).toBe(false);
        expect(isConfidentlyMapped({ kind: 'mapped', classifications: [{ systemKey: 'cardio', topicKey: null, confidence: 0.4, splitWeight: 1 }] })).toBe(false);
        expect(isConfidentlyMapped({ kind: 'mapped', classifications: [{ systemKey: 'cardio', topicKey: null, confidence: 0.5, splitWeight: 1 }] })).toBe(true);
    });
});
