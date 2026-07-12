/**
 * Unit tests for Auth_Page redirect logic
 * Requirements: 1.4, 1.5
 */

import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation BEFORE importing any module that uses it
// ---------------------------------------------------------------------------
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: jest.fn(),
  usePathname: () => '/',
}));

// ---------------------------------------------------------------------------
// Mock AuthContext — we control user and isGuest per test
// ---------------------------------------------------------------------------
const mockAuthValue: {
  user: object | null;
  isGuest: boolean;
  loading: boolean;
  isAdmin: boolean;
  isMockMode: boolean;
  login: jest.Mock;
  signup: jest.Mock;
  logout: jest.Mock;
  refreshProfile: jest.Mock;
} = {
  user: null,
  isGuest: false,
  loading: false,
  isAdmin: false,
  isMockMode: true,
  login: jest.fn(),
  signup: jest.fn(),
  logout: jest.fn(),
  refreshProfile: jest.fn(),
};

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

// ---------------------------------------------------------------------------
// Import the component AFTER mocks are set up
// ---------------------------------------------------------------------------
import { useSearchParams } from 'next/navigation';
import AuthPage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal URLSearchParams-compatible object with a `.get()` method */
function makeSearchParams(params: Record<string, string> = {}) {
  return {
    get: (key: string) => params[key] ?? null,
  };
}

function renderAuthPage() {
  return render(
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth_Page redirect logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no search params
    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams());
  });

  // -------------------------------------------------------------------------
  // Requirement 1.4 — authenticated user is always redirected to /
  // -------------------------------------------------------------------------
  it('redirects an authenticated user (user !== null) to /', () => {
    mockAuthValue.user = { id: 'user-1', email: 'a@b.com', display_name: 'Alice' };
    mockAuthValue.isGuest = false;

    renderAuthPage();

    expect(mockRouterPush).toHaveBeenCalledWith('/');
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5 — guest without ?intent=signin is redirected to /
  // -------------------------------------------------------------------------
  it('redirects a guest who navigated directly to /auth (no ?intent=signin) to /', () => {
    mockAuthValue.user = null;
    mockAuthValue.isGuest = true;

    // No intent param
    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams());

    renderAuthPage();

    expect(mockRouterPush).toHaveBeenCalledWith('/');
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5 — guest WITH ?intent=signin is NOT redirected
  // -------------------------------------------------------------------------
  it('does NOT redirect a guest who arrived via the Sign In / Sign Up button (?intent=signin)', () => {
    mockAuthValue.user = null;
    mockAuthValue.isGuest = true;

    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams({ intent: 'signin' }));

    renderAuthPage();

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('shows the auth form (Sign In button) when guest arrives with ?intent=signin', () => {
    mockAuthValue.user = null;
    mockAuthValue.isGuest = true;

    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams({ intent: 'signin' }));

    renderAuthPage();

    // The submit button (type="submit") should be present and labelled "Sign In"
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  // -------------------------------------------------------------------------
  // Edge case — loading state: user is null, not a guest yet (loading=true)
  // No redirect should fire while auth state is still being resolved
  // -------------------------------------------------------------------------
  it('does NOT redirect while auth is still loading (user=null, isGuest=false)', () => {
    mockAuthValue.user = null;
    mockAuthValue.isGuest = false;
    mockAuthValue.loading = true;

    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams());

    renderAuthPage();

    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
