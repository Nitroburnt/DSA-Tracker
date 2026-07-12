/**
 * GuestDataService
 *
 * Manages guest-mode completion state in localStorage under the key
 * `dsa_tracker_guest_data`. Falls back to an in-memory store for the
 * duration of the session if localStorage is unavailable (e.g. private
 * browsing with storage blocked, quota exceeded, security policy).
 *
 * This module has NO Supabase dependency. Its only external import is
 * `calculateStreaks` from `db.ts`.
 *
 * Feature: guest-mode-auth
 */

import { calculateStreaks, UserCompletion } from './db';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface GuestData {
  max_streak: number;
  current_streak: number;
  /** problem_id → ISO 8601 UTC timestamp */
  completions: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dsa_tracker_guest_data';

/**
 * In-memory fallback used when localStorage is unavailable.
 * Starts as `null` (no data) and mirrors the shape of the localStorage value.
 */
let _memoryStore: GuestData | null = null;

/**
 * Whether we have permanently fallen back to the in-memory store for this
 * session. Flipped to `true` on the first caught localStorage exception.
 */
let _useMemoryStore = false;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function defaultGuestData(): GuestData {
  return { max_streak: 0, current_streak: 0, completions: {} };
}

/**
 * Recalculates `current_streak` and `max_streak` from the completions map
 * and returns a new `GuestData` object with updated streak values.
 */
function withRecalculatedStreaks(data: GuestData): GuestData {
  const userCompletions: UserCompletion[] = Object.entries(data.completions).map(
    ([problemId, timestamp]) => ({
      id: problemId,
      user_id: 'guest',
      problem_id: problemId,
      completed_at: timestamp,
    })
  );

  const { current_streak, max_streak } = calculateStreaks(userCompletions);
  return { ...data, current_streak, max_streak };
}

// ---------------------------------------------------------------------------
// Public service object
// ---------------------------------------------------------------------------

export const GuestDataService = {
  /**
   * Reads guest data from localStorage (or the in-memory fallback).
   * Returns `null` if no data has been stored yet, or on parse failure.
   */
  read(): GuestData | null {
    if (_useMemoryStore) {
      return _memoryStore;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      return JSON.parse(raw) as GuestData;
    } catch {
      // localStorage access failed — switch to in-memory for the session
      _useMemoryStore = true;
      return _memoryStore;
    }
  },

  /**
   * Serialises `data` and writes it to localStorage (or the in-memory fallback).
   */
  write(data: GuestData): void {
    if (_useMemoryStore) {
      _memoryStore = data;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage access failed — switch to in-memory for the session
      _useMemoryStore = true;
      _memoryStore = data;
    }
  },

  /**
   * Removes the guest data key from localStorage and clears the in-memory store.
   */
  clear(): void {
    _memoryStore = null;

    if (_useMemoryStore) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage access failed — in-memory store is already cleared above
      _useMemoryStore = true;
    }
  },

  /**
   * Adds a completion entry for `problemId` (timestamped now), recalculates
   * streaks, and writes the result back.
   */
  addCompletion(problemId: string): void {
    const current = this.read() ?? defaultGuestData();
    const updated: GuestData = {
      ...current,
      completions: {
        ...current.completions,
        [problemId]: new Date().toISOString(),
      },
    };
    this.write(withRecalculatedStreaks(updated));
  },

  /**
   * Removes the completion entry for `problemId` (if present), recalculates
   * streaks, and writes the result back.
   */
  removeCompletion(problemId: string): void {
    const current = this.read() ?? defaultGuestData();
    const { [problemId]: _removed, ...rest } = current.completions;
    const updated: GuestData = { ...current, completions: rest };
    this.write(withRecalculatedStreaks(updated));
  },
};
