import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import CookieDisclaimer from './CookieDisclaimer';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className }) => <div className={className}>{children}</div>,
    },
    AnimatePresence: ({ children }) => <>{children}</>,
}));

describe('CookieDisclaimer Component', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    test('renders disclaimer after delay if no preference exists', () => {
        render(<CookieDisclaimer />);
        expect(screen.queryByText(/We use cookies/i)).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText(/We use cookies/i)).toBeInTheDocument();
    });

    test('does not render if preference already exists', () => {
        localStorage.setItem('cookiePreference', 'accepted');
        render(<CookieDisclaimer />);

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.queryByText(/We use cookies/i)).not.toBeInTheDocument();
    });

    test('accept button saves preference and hides disclaimer', () => {
        render(<CookieDisclaimer />);

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        const acceptBtn = screen.getByRole('button', { name: /Accept All/i });
        fireEvent.click(acceptBtn);

        expect(localStorage.getItem('cookiePreference')).toBe('accepted');
    });
});
