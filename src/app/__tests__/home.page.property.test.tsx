/**
 * Property-based tests for Home_Page
 *
 * Property 4: Home_Page renders all problems in guest mode
 * Property 7: Sidebar streak display matches source data
 *
 * Feature: guest-mode-auth
 * Validates: Requirements 1.2, 1.6, 3.4, 5.1, 5.2
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use these modules
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/',
}));

jest.mock('@/lib/db', () => ({
  dbService: {
    getProblems: jest.fn().mockResolvedValue([]),
    getCompletions: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/lib/guestDataService', () => ({
  GuestDataService: {
    read: jest.fn(),
    write: jest.fn(),
    clear: jest.fn(),
    addCompletion: jest.fn(),
    removeCompletion: jest.fn(),
  },
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { useAuth } from '@/context/AuthContext';
import { GuestDataService } from '@/lib/guestDataService';
import { dbService } from '@/lib/db';
import type { Problem } from '@/lib/db';
import HomePage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGuestRead = GuestDataService.read as jest.MockedFunction<typeof GuestDataService.read>;
const mockGetProblems = dbService.getProblems as jest.MockedFunction<typeof dbService.getProblems>;

/** Render HomePage and wait for async data loading to complete. */
async function renderHomePage(): Promise<void> {
  await act(async () => {
    render(<HomePage />);
  });
}

/**
 * Find the rendered text for a streak value in the sidebar.
 * The sidebar renders: <p>{value} <span>days</span></p>
 * We look for a element whose text content includes the number string.
 */
function findStreakValue(value: number): HTMLElement | null {
  // Use getAllByText with exact:false to find elements containing just the number
  // The streak is rendered as text node "{value} " next to a <span>days</span>
  try {
    const elements = screen.getAllByText((content, element) => {
      if (!element) return false;
      // Match elements where the direct text content (ignoring child elements) contains the number
      const textNodes = Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim())
        .join('');
      return textNodes === value.toString();
    });
    return elements.length > 0 ? elements[0] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Property 4: Home_Page renders all problems in guest mode
// Feature: guest-mode-auth, Property 4: Home_Page renders all problems in guest mode
// Validates: Requirements 1.2, 1.6
// ---------------------------------------------------------------------------

describe('Property 4: Home_Page renders all problems in guest mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Guest mode auth context — consistent for all runs in this suite
    mockUseAuth.mockReturnValue({
      isGuest: true,
      user: null,
      loading: false,
      isAdmin: false,
      isMockMode: false,
      logout: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
      refreshProfile: jest.fn(),
    });
    // No prior guest data (streaks = 0, no completions)
    mockGuestRead.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it(
    // Feature: guest-mode-auth, Property 4: Home_Page renders all problems in guest mode
    'renders exactly N problem rows for any N problems returned by dbService.getProblems()',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of Problem objects.
          // All problems share the SAME topic ("TestTopic") and the SAME day_number (1)
          // so that no spacer <tr> rows are injected between day groups.
          // (Spacer fires only when isLastOfClassDay && idx !== last; with a single
          //  day_number across all items, isLastOfClassDay is only true for the very
          //  last row, which is excluded by the second condition — zero spacers total.)
          fc.array(
            fc.record({
              id: fc.uuid(),
              topic: fc.constant('TestTopic'),
              day_number: fc.constant(1),
              problem_name: fc.string({ minLength: 1 }),
              link_1: fc.webUrl(),
            }),
            { maxLength: 20 },
          ),
          async (problems: Problem[]) => {
            // Arrange: mock getProblems to return the generated array
            mockGetProblems.mockResolvedValue(problems);

            // Act: render and wait for async data loading
            const { container } = await act(async () => render(<HomePage />));

            if (problems.length === 0) {
              // Requirement 1.6: empty-state message is shown
              expect(
                screen.getByText(/NO CURRICULUM NODES LOADED/i),
              ).toBeInTheDocument();
            } else {
              // Requirement 1.2: exactly one <tr> per problem (no spacers because
              // all problems share the same day_number within the same topic)
              const allBodyRows = container.querySelectorAll('tbody tr');
              expect(allBodyRows.length).toBe(problems.length);
            }

            // Clean up between runs
            cleanup();
            jest.clearAllMocks();
            // Re-apply the persistent mocks for subsequent runs
            mockUseAuth.mockReturnValue({
              isGuest: true,
              user: null,
              loading: false,
              isAdmin: false,
              isMockMode: false,
              logout: jest.fn(),
              login: jest.fn(),
              signup: jest.fn(),
              refreshProfile: jest.fn(),
            });
            mockGuestRead.mockReturnValue(null);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 7: Sidebar streak display matches source data
// Feature: guest-mode-auth, Property 7: Sidebar streak display matches source data
// Validates: Requirements 3.4, 5.1, 5.2
// ---------------------------------------------------------------------------

describe('Property 7: Sidebar streak display matches source data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: getProblems returns empty array (no curriculum loaded needed for this test)
    mockGetProblems.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it(
    // Feature: guest-mode-auth, Property 7: Sidebar streak display matches source data
    'guest mode: sidebar renders current_streak and max_streak from GuestDataService.read()',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.nat(), fc.nat()),
          async ([current_streak, max_streak]) => {
            // Arrange: guest mode auth context
            mockUseAuth.mockReturnValue({
              isGuest: true,
              user: null,
              loading: false,
              isAdmin: false,
              isMockMode: false,
              logout: jest.fn(),
              login: jest.fn(),
              signup: jest.fn(),
              refreshProfile: jest.fn(),
            });

            // Arrange: GuestDataService returns the generated streak pair
            mockGuestRead.mockReturnValue({
              current_streak,
              max_streak,
              completions: {},
            });

            // Act
            await renderHomePage();

            // Assert: sidebar shows current_streak value
            const currentEl = findStreakValue(current_streak);
            expect(currentEl).not.toBeNull();

            // Assert: sidebar shows max_streak value
            // When current_streak === max_streak we need to find at least 2 occurrences
            if (current_streak === max_streak) {
              const allElements = screen.getAllByText((content, element) => {
                if (!element) return false;
                const textNodes = Array.from(element.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE)
                  .map(node => node.textContent?.trim())
                  .join('');
                return textNodes === current_streak.toString();
              });
              // Both current and max streak cells show the same number — at least 2
              expect(allElements.length).toBeGreaterThanOrEqual(2);
            } else {
              const maxEl = findStreakValue(max_streak);
              expect(maxEl).not.toBeNull();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: guest-mode-auth, Property 7: Sidebar streak display matches source data
    'authenticated mode: sidebar renders current_streak and max_streak from UserProfile',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.nat(), fc.nat()),
          async ([current_streak, max_streak]) => {
            // Arrange: authenticated auth context with generated streak values
            mockUseAuth.mockReturnValue({
              isGuest: false,
              user: {
                id: 'u1',
                display_name: 'Tester',
                email: 'a@b.com',
                current_streak,
                max_streak,
                is_admin: false,
                role: 'user' as const,
                created_at: new Date().toISOString(),
              },
              loading: false,
              isAdmin: false,
              isMockMode: false,
              logout: jest.fn(),
              login: jest.fn(),
              signup: jest.fn(),
              refreshProfile: jest.fn(),
            });

            // GuestDataService.read returns null in authenticated mode (not used)
            mockGuestRead.mockReturnValue(null);

            // Act
            await renderHomePage();

            // Assert: sidebar shows current_streak value
            const currentEl = findStreakValue(current_streak);
            expect(currentEl).not.toBeNull();

            // Assert: sidebar shows max_streak value
            if (current_streak === max_streak) {
              const allElements = screen.getAllByText((content, element) => {
                if (!element) return false;
                const textNodes = Array.from(element.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE)
                  .map(node => node.textContent?.trim())
                  .join('');
                return textNodes === current_streak.toString();
              });
              expect(allElements.length).toBeGreaterThanOrEqual(2);
            } else {
              const maxEl = findStreakValue(max_streak);
              expect(maxEl).not.toBeNull();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 5: Guest completions reflected in UI on mount
// Feature: guest-mode-auth, Property 5: Guest completions reflected on mount
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------

describe('Property 5: Guest completions reflected in UI on mount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    // Feature: guest-mode-auth, Property 5: Guest completions reflected on mount
    'checkboxes for completed problem IDs are rendered checked when Home_Page mounts in guest mode',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary completions map (at least 1 entry to make test non-trivial)
          fc.dictionary(
            fc.uuid(),
            fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
            { minKeys: 1 },
          ),
          async (completions) => {
            // Build a problems array where each problem_id matches a key in completions
            const problems = Object.keys(completions).map((id, i) => ({
              id,
              topic: 'Test',
              day_number: i + 1,
              problem_name: 'Problem ' + i,
              link_1: 'https://example.com/' + id,
            }));

            // Arrange: guest mode auth context
            mockUseAuth.mockReturnValue({
              isGuest: true,
              user: null,
              loading: false,
              isAdmin: false,
              isMockMode: false,
              logout: jest.fn(),
              login: jest.fn(),
              signup: jest.fn(),
              refreshProfile: jest.fn(),
            });

            // Arrange: GuestDataService.read() returns the seeded completions
            mockGuestRead.mockReturnValue({
              current_streak: 0,
              max_streak: 0,
              completions,
            });

            // Arrange: dbService.getProblems() returns problems matching the completion keys
            mockGetProblems.mockResolvedValue(problems);

            // Act: render and wait for async data loading
            const { container, unmount } = await (async () => {
              let result!: ReturnType<typeof render>;
              await act(async () => {
                result = render(<HomePage />);
              });
              return result;
            })();

            // Assert: checked checkboxes count equals number of completion entries
            const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
            const expectedCount = Object.keys(completions).length;
            expect(checkedBoxes.length).toBe(expectedCount);

            // Clean up between iterations
            unmount();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
