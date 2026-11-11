import { describe, it, expect } from 'vitest';
import { isTrustedRendererUrl, isExternalWebUrl, ALLOWED_PERMISSIONS } from '../main/security';

describe('isTrustedRendererUrl — Windows packaged build', () => {
    const origins = {
        rendererFile: 'C:\\Users\\Jane Doe\\AppData\\Local\\sekel\\app-2.0.0\\resources\\app.asar\\dist\\renderer\\index.html',
    };

    it('accepts the bundled index.html (file URL, encoded space)', () => {
        const url = 'file:///C:/Users/Jane%20Doe/AppData/Local/sekel/app-2.0.0/resources/app.asar/dist/renderer/index.html';
        expect(isTrustedRendererUrl(url, origins, 'win32')).toBe(true);
    });

    it('is case-insensitive on Windows paths and ignores hash/query', () => {
        const url = 'file:///c:/users/jane%20doe/appdata/local/sekel/app-2.0.0/resources/app.asar/dist/renderer/index.html?x=1#/decks';
        expect(isTrustedRendererUrl(url, origins, 'win32')).toBe(true);
    });

    it('rejects any other local file', () => {
        expect(isTrustedRendererUrl('file:///C:/Users/Jane%20Doe/Downloads/evil.html', origins, 'win32')).toBe(false);
    });

    it('rejects remote pages and junk', () => {
        expect(isTrustedRendererUrl('https://evil.example/', origins, 'win32')).toBe(false);
        expect(isTrustedRendererUrl('http://localhost:5173/', origins, 'win32')).toBe(false);
        expect(isTrustedRendererUrl('', origins, 'win32')).toBe(false);
        expect(isTrustedRendererUrl('not a url', origins, 'win32')).toBe(false);
        expect(isTrustedRendererUrl('javascript:alert(1)', origins, 'win32')).toBe(false);
    });
});

describe('isTrustedRendererUrl — POSIX builds', () => {
    const origins = { rendererFile: '/Applications/Sekel.app/Contents/Resources/app.asar/dist/renderer/index.html' };

    it('accepts the bundled index.html', () => {
        const url = 'file:///Applications/Sekel.app/Contents/Resources/app.asar/dist/renderer/index.html#/';
        expect(isTrustedRendererUrl(url, origins, 'darwin')).toBe(true);
    });

    it('is case-sensitive off Windows', () => {
        const url = 'file:///applications/sekel.app/Contents/Resources/app.asar/dist/renderer/index.html';
        expect(isTrustedRendererUrl(url, origins, 'darwin')).toBe(false);
    });
});

describe('isTrustedRendererUrl — dev server', () => {
    const origins = {
        rendererFile: '/repo/apps/desktop/dist/renderer/index.html',
        devServerUrl: 'http://localhost:5173',
    };

    it('accepts the dev-server origin on any path', () => {
        expect(isTrustedRendererUrl('http://localhost:5173/', origins, 'linux')).toBe(true);
        expect(isTrustedRendererUrl('http://localhost:5173/src/index.html#/x', origins, 'linux')).toBe(true);
    });

    it('rejects other ports, hosts and schemes', () => {
        expect(isTrustedRendererUrl('http://localhost:5174/', origins, 'linux')).toBe(false);
        expect(isTrustedRendererUrl('https://localhost:5173/', origins, 'linux')).toBe(false);
        expect(isTrustedRendererUrl('http://127.0.0.1:5173/', origins, 'linux')).toBe(false);
    });
});

describe('isExternalWebUrl', () => {
    it('only allows http(s)', () => {
        expect(isExternalWebUrl('https://sekel.app')).toBe(true);
        expect(isExternalWebUrl('http://example.com')).toBe(true);
        expect(isExternalWebUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
        expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
        expect(isExternalWebUrl('ms-msdt:/id')).toBe(false);
        expect(isExternalWebUrl('garbage')).toBe(false);
    });
});

describe('ALLOWED_PERMISSIONS', () => {
    it('never grants device or location access', () => {
        for (const p of ['media', 'geolocation', 'notifications', 'hid', 'serial', 'usb', 'display-capture', 'openExternal']) {
            expect(ALLOWED_PERMISSIONS.has(p)).toBe(false);
        }
    });
});
