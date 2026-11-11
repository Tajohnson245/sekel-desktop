// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';

const captureException = vi.fn();
vi.mock('@sentry/electron/renderer', () => ({
    captureException: (...args: unknown[]) => captureException(...args),
    withScope: (fn: (scope: { setTag: () => void; setContext: () => void }) => void) =>
        fn({ setTag: () => {}, setContext: () => {} }),
}));
vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));

import RouteErrorScreen from '../router/RouteErrorScreen';

let shouldThrow = true;
function FlakyPage() {
    if (shouldThrow) throw new Error('boom in page');
    return <p>page content</p>;
}

function Layout() {
    return (
        <div>
            <nav>sidebar</nav>
            <Outlet />
        </div>
    );
}

function makeRouter() {
    return createMemoryRouter([
        {
            path: '/',
            element: <Layout />,
            errorElement: <RouteErrorScreen />,
            children: [
                {
                    errorElement: <RouteErrorScreen inline />,
                    children: [
                        { index: true, element: <p>home</p> },
                        { path: 'flaky', element: <FlakyPage /> },
                    ],
                },
            ],
        },
    ], { initialEntries: ['/flaky'] });
}

beforeEach(() => {
    shouldThrow = true;
    captureException.mockClear();
    // React logs caught render errors to console.error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('RouteErrorScreen', () => {
    it('renders inside the layout and reports the crash to Sentry', () => {
        render(<RouterProvider router={makeRouter()} />);
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText('sidebar')).toBeTruthy();            // layout survives
        expect(screen.getByText('boom in page')).toBeTruthy();
        expect(captureException).toHaveBeenCalledTimes(1);
        expect((captureException.mock.calls[0][0] as Error).message).toBe('boom in page');
    });

    it('"Try again" remounts the route', () => {
        render(<RouterProvider router={makeRouter()} />);
        shouldThrow = false;
        fireEvent.click(screen.getByText('error_boundary.retry'));
        expect(screen.getByText('page content')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('"Go back" returns to the dashboard', () => {
        render(<RouterProvider router={makeRouter()} />);
        fireEvent.click(screen.getByText('error_boundary.go_back'));
        expect(screen.getByText('home')).toBeTruthy();
    });
});
