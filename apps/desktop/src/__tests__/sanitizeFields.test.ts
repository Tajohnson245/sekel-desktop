import { describe, it, expect } from 'vitest';
import { sanitizeTemplateHtml, sanitizeCardTemplates } from '../main/import/sanitizeFields';

describe('sanitizeTemplateHtml — Anki template tags', () => {
    it.each([
        '{{Front}}',
        '{{FrontSide}}<hr id="answer">{{Back}}',
        '{{#Tags}}<span>{{Tags}}</span>{{/Tags}}',
        '{{^Back}}No back{{/Back}}',
        '{{type:Back}}',
        '{{cloze:Text}}',
        '{{type:cloze:Text}}',
        '{{hint:Extra Info}}',
        '{{tts en_US voices=Apple_Samantha speed=1.2:Front}}',
        "{{Author's note}}",
        '{{ Front }}',
    ])('preserves %s', (tmpl) => {
        expect(sanitizeTemplateHtml(tmpl)).toBe(tmpl);
    });

    it('preserves a field reference inside an attribute', () => {
        expect(sanitizeTemplateHtml('<img src="{{Image}}">')).toBe('<img src="{{Image}}">');
    });

    it('still strips scripts and event handlers around valid tags', () => {
        const out = sanitizeTemplateHtml('<div onclick="alert(1)">{{Front}}</div><script>alert(2)</script>');
        expect(out).toBe('<div>{{Front}}</div>');
    });

    it('does not restore markup hidden inside a tag', () => {
        const out = sanitizeTemplateHtml('{{<img src=x onerror=alert(1)>}}');
        expect(out).not.toMatch(/onerror/i);
    });

    it('does not restore a script hidden inside a tag', () => {
        const out = sanitizeTemplateHtml('{{<script>alert(1)</script>}}');
        expect(out).not.toMatch(/<script/i);
    });

    it('does not let a tag break out of an attribute', () => {
        const out = sanitizeTemplateHtml('<a href="{{x" onmouseover="alert(1)}}">link</a>');
        expect(out).not.toMatch(/onmouseover/i);
    });

    it('applies the same rules through sanitizeCardTemplates', () => {
        const out = JSON.parse(sanitizeCardTemplates([
            { name: 'Card 1', front_template: '{{Front}}', back_template: '{{<img src=x onerror=alert(1)>}}' },
        ]));
        expect(out[0].front_template).toBe('{{Front}}');
        expect(out[0].back_template).not.toMatch(/onerror/i);
    });
});
