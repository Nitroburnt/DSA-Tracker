/**
 * Property-based tests for GuestDataService
 *
 * Feature: guest-mode-auth, Property 1: GuestDataService round-trip
 *
 * Validates: Requirements 2.1
 */

import * as fc from 'fast-check';
import { GuestDataService, GuestData } from '../guestDataService';

// ---------------------------------------------------------------------------
// Arbitrary generator for GuestData
// ---------------------------------------------------------------------------

const arbGuestData: fc.Arbitrary<GuestData> = fc.record({
  max_streak: fc.nat(),
  current_streak: fc.nat(),
  completions: fc.dictionary(
    fc.uuid(),
    fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  ),
});

// ---------------------------------------------------------------------------
// Property 1: GuestDataService round-trip
//
// For any valid GuestData, write(data) then read() returns a deeply equal object.
// ---------------------------------------------------------------------------

describe('GuestDataService – Property 1: round-trip', () => {
  beforeEach(() => {
    // Clear all guest state before each property run:
    // GuestDataService.clear() resets _memoryStore to null and removes the
    // localStorage key.  We also call localStorage.clear() to remove any
    // leftover keys from other tests.
    GuestDataService.clear();
    localStorage.clear();
  });

  it(
    // Feature: guest-mode-auth, Property 1: GuestDataService round-trip
    'write(data) then read() returns a deeply equal GuestData object',
    () => {
      fc.assert(
        fc.property(arbGuestData, (data: GuestData) => {
          // Arrange: reset state for this run
          GuestDataService.clear();
          localStorage.clear();

          // Act
          GuestDataService.write(data);
          const result = GuestDataService.read();

          // Assert: result is deeply equal to the written data
          expect(result).not.toBeNull();
          expect(result).toEqual(data);
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// localStorage mock (shared by Property 2)
// ---------------------------------------------------------------------------

let _storage: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => _storage[key] ?? null,
  setItem: (key: string, value: string) => { _storage[key] = value; },
  removeItem: (key: string) => { delete _storage[key]; },
  clear: () => { _storage = {}; },
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

/**
 * Resets both the localStorage mock and GuestDataService's internal state.
 * Calling GuestDataService.clear() resets _memoryStore to null; since
 * localStorage is functional in tests _useMemoryStore remains false.
 */
function resetGuestDataService() {
  _storage = {};
  GuestDataService.clear();
}

// ---------------------------------------------------------------------------
// Property 2: Completion add/remove round-trip
// Feature: guest-mode-auth, Property 2: Completion add/remove round-trip
// Validates: Requirements 2.2, 2.3
// ---------------------------------------------------------------------------

describe('GuestDataService — Property 2: Completion add/remove round-trip', () => {
  /**
   * For any non-empty problemId, calling addCompletion(id) then
   * removeCompletion(id) leaves `completions` identical to its pre-call state,
   * regardless of what completions were already present in the store.
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  it(
    // Feature: guest-mode-auth, Property 2: Completion add/remove round-trip
    'addCompletion then removeCompletion restores the original completions map',
    () => {
      fc.assert(
        fc.property(
          // Arbitrary initial completions map to seed the service with
          fc.dictionary(
            fc.uuid(),
            fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
          ),
          // A non-empty problemId that may or may not already be in the map
          fc.string({ minLength: 1 }),
          (initialCompletions, problemId) => {
            resetGuestDataService();

            // Seed GuestDataService with arbitrary initial data
            GuestDataService.write({
              max_streak: 0,
              current_streak: 0,
              completions: initialCompletions,
            });

            // Capture the completions map *before* the paired calls
            const before = { ...(GuestDataService.read()?.completions ?? {}) };

            // Execute the round-trip
            GuestDataService.addCompletion(problemId);
            GuestDataService.removeCompletion(problemId);

            // Capture the completions map *after* the paired calls
            const after = GuestDataService.read()?.completions ?? {};

            // Assert deep equality
            expect(after).toEqual(before);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
