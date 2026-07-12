// Feature: guest-mode-auth, Property 6: mergeGuestData upsert correctness

/**
 * Property 6: mergeGuestData upsert correctness
 *
 * For any guest completions and any pre-existing MockMode records,
 * after `mergeGuestData` completes:
 *   (1) every pre-existing record is unchanged,
 *   (2) every guest-only problem ID is now present,
 *   (3) no extra records exist.
 *
 * Validates: Requirements 4.4
 */

import * as fc from 'fast-check';
import { dbService, UserCompletion } from '../db';
import type { GuestData } from '../guestDataService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'test-user-property-6';
const completionsKey = `dsa_mock_completions_${TEST_USER_ID}`;
const profileKey = `dsa_mock_profile_${TEST_USER_ID}`;

/** Seed the mock completions store for the test user. */
function seedCompletions(records: UserCompletion[]): void {
  localStorage.setItem(completionsKey, JSON.stringify(records));
}

/** Seed a minimal mock profile so streak persistence doesn't fail silently. */
function seedProfile(): void {
  const profile = {
    id: TEST_USER_ID,
    email: 'test@example.com',
    display_name: 'Test User',
    max_streak: 0,
    current_streak: 0,
    role: 'user',
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(profileKey, JSON.stringify(profile));
}

/** Read the mock completions back from localStorage. */
function readCompletions(): UserCompletion[] {
  const raw = localStorage.getItem(completionsKey);
  return raw ? JSON.parse(raw) : [];
}

/** Build a UserCompletion record from a problem ID (for pre-seeding). */
function makeCompletion(problemId: string, index: number): UserCompletion {
  return {
    id: `existing-${index}`,
    user_id: TEST_USER_ID,
    problem_id: problemId,
    completed_at: new Date(Date.now() - index * 60_000).toISOString(),
  };
}

/** Build a GuestData object from a completions map (problem_id → ISO timestamp). */
function makeGuestData(completions: Record<string, string>): GuestData {
  return {
    max_streak: 0,
    current_streak: 0,
    completions,
  };
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('Property 6: mergeGuestData upsert correctness (MockMode)', () => {
  beforeEach(() => {
    localStorage.clear();
    seedProfile();
  });

  it('should satisfy all three upsert correctness conditions for disjoint and overlapping sets', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a set of existing problem IDs (pre-existing records)
        fc.set(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
        // Generate a set of guest problem IDs (may overlap with existing)
        fc.set(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
        async (existingIdsSet, guestIdsSet) => {
          // fc.set() returns a Set in fast-check v4 — convert to arrays
          const existingIds = [...existingIdsSet];
          const guestIds = [...guestIdsSet];

          // --- Arrange ---

          // Reset localStorage for each iteration
          localStorage.clear();
          seedProfile();

          // Build and seed pre-existing completion records
          const existingRecords: UserCompletion[] = existingIds.map((id, i) =>
            makeCompletion(id, i)
          );
          seedCompletions(existingRecords);

          // Build guest data as a completions map
          const guestCompletions: Record<string, string> = {};
          for (const id of guestIds) {
            guestCompletions[id] = new Date().toISOString();
          }
          const guestData = makeGuestData(guestCompletions);

          // --- Act ---
          const result = await dbService.mergeGuestData(TEST_USER_ID, guestData);

          // --- Assert ---
          expect(result.success).toBe(true);

          const afterRecords = readCompletions();
          const afterMap = new Map(afterRecords.map(r => [r.problem_id, r]));

          // Condition (1): every pre-existing record is unchanged
          for (const original of existingRecords) {
            const updated = afterMap.get(original.problem_id);
            expect(updated).toBeDefined();
            expect(updated!.completed_at).toBe(original.completed_at);
            expect(updated!.user_id).toBe(original.user_id);
          }

          // Condition (2): every guest-only problem ID is now present
          for (const guestId of guestIds) {
            expect(afterMap.has(guestId)).toBe(true);
          }

          // Condition (3): no extra records exist beyond union of existing + guest
          const expectedIds = new Set([...existingIds, ...guestIds]);
          expect(afterRecords.length).toBe(expectedIds.size);
          for (const record of afterRecords) {
            expect(expectedIds.has(record.problem_id)).toBe(true);
          }
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});
