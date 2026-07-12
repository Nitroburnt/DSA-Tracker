/**
 * Unit tests for AuthContext — guest initialisation and post-login merge flow
 * Task 9.1 — Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger the mocked modules
// ---------------------------------------------------------------------------

// Mock next/navigation
const mockRouterPush = jest.fn();
const mockPathname = jest.fn(() => '/');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname(),
}));

// Mock @/lib/db
const mockGetCurrentUser = jest.fn();
const mockSignIn = jest.fn();
const mockMergeGuestData = jest.fn();

jest.mock('@/lib/db', () => ({
  dbService: {
    getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
    signIn: (...args: any[]) => mockSignIn(...args),
    mergeGuestData: (...args: any[]) => mockMergeGuestData(...args),
    signUp: jest.fn(),
    signOut: jest.fn(),
    getProblems: jest.fn().mockResolvedValue([]),
  },
  // Re-export types as values so the module resolves without error
  UserProfile: undefined,
}));

// Mock @/lib/guestDataService
const mockGuestRead = jest.fn();
const mockGuestClear = jest.fn();

jest.mock('@/lib/guestDataService', () => ({
  GuestDataService: {
    read: (...args: any[]) => mockGuestRead(...args),
    clear: (...args: any[]) => mockGuestClear(...args),
    write: jest.fn(),
    addCompletion: jest.fn(),
    removeCompletion: jest.fn(),
  },
}));

// Mock @/lib/supabaseClient — disable Supabase so the onAuthStateChange branch is skipped
jest.mock('@/lib/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------
import { AuthProvider, useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Test consumer — exposes context values and a login trigger
// ---------------------------------------------------------------------------
function AuthConsumer({ onReady }: { onReady?: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();

  // Call onReady once loading is done so tests can inspect state
  React.useEffect(() => {
    if (!ctx.loading && onReady) {
      onReady(ctx);
    }
  }, [ctx.loading, onReady, ctx]);

  return (
    <div>
      <span data-testid="isGuest">{String(ctx.isGuest)}</span>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="user">{ctx.user ? ctx.user.id : 'null'}</span>
      <button
        data-testid="login-btn"
        onClick={() => ctx.login('test@example.com', 'password')}
      >
        Login
      </button>
    </div>
  );
}

function renderWithProvider(onReady?: (ctx: ReturnType<typeof useAuth>) => void) {
  return render(
    <AuthProvider>
      <AuthConsumer onReady={onReady} />
    </AuthProvider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fakeProfile = {
  id: 'user-123',
  email: 'test@example.com',
  display_name: 'Test User',
  max_streak: 0,
  current_streak: 0,
  role: 'user' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname.mockReturnValue('/');
});

// ============================================================================
// 1. Guest initialisation — no session
// ============================================================================

describe('Guest initialisation', () => {
  it('sets isGuest=true and does NOT call router.push when getCurrentUser returns null', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    renderWithProvider();

    // Wait until loading settles
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('isGuest').textContent).toBe('true');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('sets isGuest=false when getCurrentUser returns a valid profile', async () => {
    mockGetCurrentUser.mockResolvedValue(fakeProfile);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('isGuest').textContent).toBe('false');
  });
});

// ============================================================================
// 2. login — GuestDataService.read is always called after successful sign-in
// ============================================================================

describe('login — GuestDataService.read is always called after successful sign-in', () => {
  it('calls GuestDataService.read even when no guest data exists (read returns null)', async () => {
    // Initial load: no session → guest
    mockGetCurrentUser
      .mockResolvedValueOnce(null)    // initial refreshProfile
      .mockResolvedValueOnce(fakeProfile); // refreshProfile inside login

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue(null); // no guest data

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));

    expect(mockGuestRead).toHaveBeenCalled();
  });

  it('calls GuestDataService.read even when guest data exists (read returns data)', async () => {
    mockGetCurrentUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeProfile);

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue({ max_streak: 0, current_streak: 0, completions: {} });
    mockMergeGuestData.mockResolvedValue({ success: true });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));

    expect(mockGuestRead).toHaveBeenCalled();
  });
});

// ============================================================================
// 3. login — no guest completions → mergeGuestData NOT called
// ============================================================================

describe('login — no guest completions', () => {
  it('does NOT call mergeGuestData when GuestDataService.read returns null', async () => {
    mockGetCurrentUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeProfile);

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue(null);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/'));

    expect(mockMergeGuestData).not.toHaveBeenCalled();
  });

  it('does NOT call mergeGuestData when GuestDataService.read returns empty completions', async () => {
    mockGetCurrentUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeProfile);

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue({ max_streak: 0, current_streak: 0, completions: {} });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/'));

    expect(mockMergeGuestData).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 4. login — with guest completions → mergeGuestData, then clear, then refreshProfile
// ============================================================================

describe('login — with guest completions', () => {
  it('calls mergeGuestData → GuestDataService.clear → refreshProfile in order', async () => {
    const callOrder: string[] = [];

    // getCurrentUser sequence: use mockResolvedValueOnce for the first two calls.
    // All subsequent calls return fakeProfile and are tracked.
    mockGetCurrentUser
      .mockResolvedValueOnce(null)        // call 1: initial mount → guest
      .mockResolvedValueOnce(fakeProfile) // call 2: first refreshProfile in login
      .mockImplementation(async () => {
        // call 3+: the post-merge refreshProfile — only these should be tracked
        callOrder.push('refreshProfile');
        return fakeProfile;
      });

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue({
      max_streak: 1,
      current_streak: 1,
      completions: { 'problem-1': '2024-01-01T00:00:00.000Z' },
    });
    mockMergeGuestData.mockImplementation(async () => {
      callOrder.push('mergeGuestData');
      return { success: true };
    });
    mockGuestClear.mockImplementation(() => {
      callOrder.push('GuestDataService.clear');
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    // Drain any extra calls that happened during mount by clearing callOrder
    callOrder.length = 0;

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/'));

    // Drain any extra post-navigation refreshProfile entries (keep only login-phase)
    // We want: exactly mergeGuestData, then GuestDataService.clear, then refreshProfile

    expect(mockMergeGuestData).toHaveBeenCalledWith('user-123', {
      max_streak: 1,
      current_streak: 1,
      completions: { 'problem-1': '2024-01-01T00:00:00.000Z' },
    });
    expect(mockGuestClear).toHaveBeenCalledTimes(1);

    // mergeGuestData must appear before GuestDataService.clear in the call order
    const mergeIdx = callOrder.indexOf('mergeGuestData');
    const clearIdx = callOrder.indexOf('GuestDataService.clear');
    const refreshIdx = callOrder.findIndex((e, i) => e === 'refreshProfile' && i > clearIdx);

    expect(mergeIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThan(mergeIdx);
    expect(refreshIdx).toBeGreaterThan(clearIdx);
  });
});

// ============================================================================
// 5. login — mergeGuestData throws → error logged, router.push still fires,
//           GuestDataService.clear NOT called
// ============================================================================

describe('login — mergeGuestData throws', () => {
  it('logs error with [guest-merge] prefix, navigates to /, and does NOT call GuestDataService.clear', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockGetCurrentUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeProfile);

    mockSignIn.mockResolvedValue({ success: true });
    mockGuestRead.mockReturnValue({
      max_streak: 1,
      current_streak: 1,
      completions: { 'problem-1': '2024-01-01T00:00:00.000Z' },
    });
    mockMergeGuestData.mockRejectedValue(new Error('merge failed'));

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/'));

    // Error should have been logged with [guest-merge] prefix
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[guest-merge]'),
      expect.anything()
    );

    // clear must NOT have been called
    expect(mockGuestClear).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
