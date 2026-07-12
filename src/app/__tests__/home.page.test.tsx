/**
 * Unit tests for Home_Page header and sidebar rendering
 *
 * Task 9.3 — guest-mode-auth spec
 * Requirements: 3.1, 3.2, 3.3, 3.4
 *
 * Covers:
 *  - Guest header: "Sign In / Sign Up" renders; Profile/Logout/Add Problem do NOT
 *  - Authenticated header: Profile and Logout render; "Sign In / Sign Up" does NOT
 *  - Header transitions after simulated login (isGuest flips to false)
 *  - Sidebar shows displayName="Guest" and streak values from guestStreaks when isGuest=true
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that resolve them
// ---------------------------------------------------------------------------

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}));

// Mock AuthContext
const mockUseAuth = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock dbService — getProblems returns a minimal stable list so the component
// does not hang waiting on async data
jest.mock('@/lib/db', () => ({
  dbService: {
    getProblems: jest.fn().mockResolvedValue([]),
    getCompletions: jest.fn().mockResolvedValue([]),
  },
}));

// Mock GuestDataService — keeps tests deterministic
jest.mock('@/lib/guestDataService', () => ({
  GuestDataService: {
    read: jest.fn().mockReturnValue(null),
    write: jest.fn(),
    clear: jest.fn(),
    addCompletion: jest.fn(),
    removeCompletion: jest.fn(),
  },
}));

// Mock lucide-react to avoid SVG rendering issues in jsdom
jest.mock('lucide-react', () => {
  const MockIcon = ({ 'data-testid': testId }: { 'data-testid'?: string }) =>
    React.createElement('span', { 'data-testid': testId });
  return new Proxy(
    {},
    {
      get: (_target, prop: string) =>
        ({ size: _s, ...rest }: { size?: number; [k: string]: unknown }) =>
          React.createElement('span', { 'data-lucide': prop, ...rest }),
    },
  );
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks are set up
// ---------------------------------------------------------------------------
import HomePage from '../page';
import { GuestDataService } from '@/lib/guestDataService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal authenticated UserProfile stub */
const makeUser = (overrides: Partial<{
  id: string;
  display_name: string;
  email: string;
  current_streak: number;
  max_streak: number;
  role: string;
}> = {}) => ({
  id: 'user-123',
  display_name: 'Alice',
  email: 'alice@example.com',
  current_streak: 5,
  max_streak: 10,
  role: 'user',
  ...overrides,
});

/** Default guest auth context */
const guestAuthContext = {
  user: null,
  loading: false,
  isAdmin: false,
  isMockMode: true,
  isGuest: true,
  login: jest.fn(),
  signup: jest.fn(),
  logout: jest.fn(),
  refreshProfile: jest.fn(),
};

/** Authenticated auth context */
const authedAuthContext = (user = makeUser()) => ({
  user,
  loading: false,
  isAdmin: false,
  isMockMode: true,
  isGuest: false,
  login: jest.fn(),
  signup: jest.fn(),
  logout: jest.fn(),
  refreshProfile: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Home_Page — header rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: GuestDataService returns null (no prior guest data)
    (GuestDataService.read as jest.Mock).mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Requirement 3.1 & 3.3: guest header shows "Sign In / Sign Up" only
  // -------------------------------------------------------------------------

  it('renders "Sign In / Sign Up" button when isGuest=true', async () => {
    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByText('Sign In / Sign Up')).toBeInTheDocument();
  });

  it('does NOT render Profile button when isGuest=true', async () => {
    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.queryByRole('button', { name: /profile/i })).not.toBeInTheDocument();
  });

  it('does NOT render Logout button when isGuest=true', async () => {
    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
  });

  it('does NOT render "Add Problem" button when isGuest=true (even if isAdmin were true)', async () => {
    mockUseAuth.mockReturnValue({ ...guestAuthContext, isAdmin: true });

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.queryByRole('button', { name: /add problem/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Requirement 3.2: authenticated header shows Profile and Logout, not guest btn
  // -------------------------------------------------------------------------

  it('renders Profile button when isGuest=false and user is set', async () => {
    mockUseAuth.mockReturnValue(authedAuthContext());

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
  });

  it('renders Logout button when isGuest=false and user is set', async () => {
    mockUseAuth.mockReturnValue(authedAuthContext());

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('does NOT render "Sign In / Sign Up" button when isGuest=false and user is set', async () => {
    mockUseAuth.mockReturnValue(authedAuthContext());

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.queryByText('Sign In / Sign Up')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Requirement 3.2: after successful login, header shows authenticated controls
  // This simulates the context state transition that occurs post-login.
  // -------------------------------------------------------------------------

  it('transitions to authenticated controls after isGuest becomes false', async () => {
    // First render: guest mode
    mockUseAuth.mockReturnValue(guestAuthContext);
    const { rerender } = render(
      React.createElement(() => {
        const auth = mockUseAuth();
        return React.createElement(HomePage);
      }),
    );

    // Confirm guest state is shown
    await act(async () => {});
    expect(screen.getByText('Sign In / Sign Up')).toBeInTheDocument();

    // Simulate login completing: context now returns authenticated state
    mockUseAuth.mockReturnValue(authedAuthContext());

    await act(async () => {
      rerender(
        React.createElement(() => {
          const auth = mockUseAuth();
          return React.createElement(HomePage);
        }),
      );
    });

    expect(screen.queryByText('Sign In / Sign Up')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe('Home_Page — sidebar rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GuestDataService.read as jest.Mock).mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Requirement 3.4: sidebar shows "Guest" and guestStreaks when isGuest=true
  // -------------------------------------------------------------------------

  it('sidebar shows displayName "Guest" when isGuest=true', async () => {
    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('sidebar shows streak values from GuestDataService when isGuest=true', async () => {
    // Provide pre-seeded guest data with known streak values
    (GuestDataService.read as jest.Mock).mockReturnValue({
      current_streak: 3,
      max_streak: 7,
      completions: {},
    });

    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    // The sidebar renders currentStreak and maxStreak with a "days" suffix label
    // Orbitron text includes the number directly; look for them in the document
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('sidebar shows zero streaks when GuestDataService.read() returns null', async () => {
    (GuestDataService.read as jest.Mock).mockReturnValue(null);

    mockUseAuth.mockReturnValue(guestAuthContext);

    await act(async () => {
      render(<HomePage />);
    });

    // Both streak counters should be 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it('sidebar shows authenticated user display_name when isGuest=false', async () => {
    mockUseAuth.mockReturnValue(authedAuthContext(makeUser({ display_name: 'Alice' })));

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    // "Guest" must NOT appear
    expect(screen.queryByText('Guest')).not.toBeInTheDocument();
  });

  it('sidebar shows authenticated user streak values when isGuest=false', async () => {
    mockUseAuth.mockReturnValue(
      authedAuthContext(makeUser({ current_streak: 12, max_streak: 20 })),
    );

    await act(async () => {
      render(<HomePage />);
    });

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
