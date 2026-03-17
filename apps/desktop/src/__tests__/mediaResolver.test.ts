import { describe, it, expect } from 'vitest';
import {
    resolveMediaInHtml,
    resolveConditionals,
    substituteFields,
    renderAnkiTemplate,
} from '../lib/mediaResolver';

const USER = 'user-1';

describe('resolveMediaInHtml', () => {
    it('replaces bare img src with sekel-media URL', () => {
        const result = resolveMediaInHtml('<img src="cat.jpg">', USER);
        expect(result).toBe('<img src="sekel-media://user-1/cat.jpg">');
    });

    it('replaces [sound:] with audio element', () => {
        const result = resolveMediaInHtml('[sound:audio.mp3]', USER);
        expect(result).toBe('<audio controls src="sekel-media://user-1/audio.mp3"></audio>');
    });

    it('leaves https:// img src unchanged', () => {
        const html = '<img src="https://example.com/img.jpg">';
        expect(resolveMediaInHtml(html, USER)).toBe(html);
    });

    it('leaves data: img src unchanged', () => {
        const html = '<img src="data:image/png;base64,abc123">';
        expect(resolveMediaInHtml(html, USER)).toBe(html);
    });

    it('leaves already-resolved sekel-media:// src unchanged', () => {
        const html = '<img src="sekel-media://user-1/cat.jpg">';
        expect(resolveMediaInHtml(html, USER)).toBe(html);
    });

    it('resolves multiple media references in one string', () => {
        const html = '<img src="a.jpg"> [sound:b.mp3] <img src="c.png">';
        const result = resolveMediaInHtml(html, USER);
        expect(result).toContain('sekel-media://user-1/a.jpg');
        expect(result).toContain('sekel-media://user-1/b.mp3');
        expect(result).toContain('sekel-media://user-1/c.png');
    });

    it('returns unchanged string when no media present', () => {
        const html = '<p>Hello world</p>';
        expect(resolveMediaInHtml(html, USER)).toBe(html);
    });

    it('encodes special characters in filename', () => {
        const result = resolveMediaInHtml('<img src="my file.jpg">', USER);
        expect(result).toBe('<img src="sekel-media://user-1/my%20file.jpg">');
    });

    it('preserves other img attributes', () => {
        const result = resolveMediaInHtml('<img class="card-img" src="cat.jpg" alt="cat">', USER);
        expect(result).toContain('class="card-img"');
        expect(result).toContain('alt="cat"');
        expect(result).toContain('src="sekel-media://user-1/cat.jpg"');
    });
});

describe('resolveConditionals', () => {
    it('shows positive conditional block when field is non-empty', () => {
        const result = resolveConditionals('{{#Front}}yes{{/Front}}', { Front: 'hello' });
        expect(result).toBe('yes');
    });

    it('hides positive conditional block when field is empty', () => {
        const result = resolveConditionals('{{#Front}}yes{{/Front}}', { Front: '' });
        expect(result).toBe('');
    });

    it('hides positive conditional block when field is missing', () => {
        const result = resolveConditionals('{{#Front}}yes{{/Front}}', {});
        expect(result).toBe('');
    });

    it('shows negative conditional block when field is empty', () => {
        const result = resolveConditionals('{{^Front}}no front{{/Front}}', { Front: '' });
        expect(result).toBe('no front');
    });

    it('hides negative conditional block when field is non-empty', () => {
        const result = resolveConditionals('{{^Front}}no front{{/Front}}', { Front: 'hello' });
        expect(result).toBe('');
    });

    it('handles nested content with HTML', () => {
        const result = resolveConditionals('{{#Hint}}<em>{{Hint}}</em>{{/Hint}}', { Hint: 'tip' });
        expect(result).toBe('<em>{{Hint}}</em>');
    });
});

describe('substituteFields', () => {
    it('replaces {{FieldName}} with field value', () => {
        const result = substituteFields('{{Front}}', { Front: 'hello' });
        expect(result).toBe('hello');
    });

    it('replaces empty string for missing field', () => {
        const result = substituteFields('{{Missing}}', {});
        expect(result).toBe('');
    });

    it('does not replace cloze syntax {{c1::...}}', () => {
        const result = substituteFields('{{c1::answer}}', { 'c1': 'x' });
        expect(result).toBe('{{c1::answer}}');
    });

    it('replaces multiple different fields', () => {
        const result = substituteFields('{{Front}} / {{Back}}', { Front: 'Q', Back: 'A' });
        expect(result).toBe('Q / A');
    });

    it('preserves HTML in field values', () => {
        const result = substituteFields('{{Field}}', { Field: '<b>bold</b>' });
        expect(result).toBe('<b>bold</b>');
    });
});

describe('renderAnkiTemplate', () => {
    it('performs full pipeline: conditionals → fields → media', () => {
        const template = '{{#Img}}<img src="{{Img}}">{{/Img}}';
        const result = renderAnkiTemplate(template, { Img: 'cat.jpg' }, USER);
        expect(result).toBe('<img src="sekel-media://user-1/cat.jpg">');
    });

    it('replaces {{FrontSide}} with rendered front HTML when provided', () => {
        const backTemplate = '{{FrontSide}}<hr><b>Answer</b>';
        const result = renderAnkiTemplate(backTemplate, {}, USER, '<p>Question</p>');
        expect(result).toBe('<p>Question</p><hr><b>Answer</b>');
    });

    it('does not replace {{FrontSide}} when frontHtml is undefined', () => {
        const template = '{{FrontSide}}';
        const result = renderAnkiTemplate(template, {}, USER);
        expect(result).toBe('{{FrontSide}}');
    });

    it('resolves media references found in field values after substitution', () => {
        const template = '{{Field}}';
        const result = renderAnkiTemplate(template, { Field: '<img src="pic.jpg">' }, USER);
        expect(result).toBe('<img src="sekel-media://user-1/pic.jpg">');
    });

    it('hides conditional block when field empty after substitution', () => {
        const template = '{{^Hint}}No hint provided{{/Hint}}';
        const result = renderAnkiTemplate(template, { Hint: '' }, USER);
        expect(result).toBe('No hint provided');
    });
});
