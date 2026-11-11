import { describe, it, expect } from 'vitest';
import en from '../locales/en/translation.json';
import de from '../locales/de/translation.json';
import es from '../locales/es/translation.json';
import fr from '../locales/fr/translation.json';
import zh from '../locales/zh/translation.json';

// Guards the i18n rule from CLAUDE.md: every key must exist in all five
// locales, and translations must keep the same placeholders so i18next can
// substitute them. en is the source of truth.

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = '', out: Record<string, string> = {}): Record<string, string> {
    for (const [k, v] of Object.entries(tree)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') out[key] = v;
        else flatten(v, key, out);
    }
    return out;
}

/** Sorted, de-duplicated `{{name}}` interpolation tokens (whitespace-insensitive). */
function interpolationTokens(value: string): string[] {
    const names = [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    return [...new Set(names)].sort();
}

/** Sorted, de-duplicated `<0>` / `</0>` component tags used by <Trans>. */
function transTags(value: string): string[] {
    return [...new Set(value.match(/<\/?\d+\s*\/?>/g) ?? [])].sort();
}

const enFlat = flatten(en as Tree);
const enKeys = Object.keys(enFlat);

const LOCALES: [string, Tree][] = [
    ['de', de as Tree],
    ['es', es as Tree],
    ['fr', fr as Tree],
    ['zh', zh as Tree],
];

describe('locale files', () => {
    it('en has keys', () => {
        expect(enKeys.length).toBeGreaterThan(0);
    });

    describe.each(LOCALES)('%s', (lang, tree) => {
        const flat = flatten(tree);

        it('has exactly the same key set as en', () => {
            const missing = enKeys.filter((k) => !(k in flat));
            const extra = Object.keys(flat).filter((k) => !(k in enFlat));
            expect({ missing, extra }).toEqual({ missing: [], extra: [] });
        });

        it('keeps the same interpolation tokens as en for every key', () => {
            const mismatches = enKeys
                .filter((k) => k in flat)
                .filter((k) => interpolationTokens(flat[k]).join('|') !== interpolationTokens(enFlat[k]).join('|'))
                .map((k) => ({ key: k, en: interpolationTokens(enFlat[k]), [lang]: interpolationTokens(flat[k]) }));
            expect(mismatches).toEqual([]);
        });

        it('keeps the same <Trans> component tags as en for every key', () => {
            const mismatches = enKeys
                .filter((k) => k in flat)
                .filter((k) => transTags(flat[k]).join('|') !== transTags(enFlat[k]).join('|'))
                .map((k) => ({ key: k, en: transTags(enFlat[k]), [lang]: transTags(flat[k]) }));
            expect(mismatches).toEqual([]);
        });

        it('has no empty values where en has text', () => {
            const empty = enKeys.filter((k) => enFlat[k].trim() !== '' && k in flat && flat[k].trim() === '');
            expect(empty).toEqual([]);
        });
    });
});
