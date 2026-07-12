# Implementation Plan: Guest Mode Auth

## Overview

Introduce a "Guest Mode First" experience to the DSA Tracker. The implementation adds `GuestDataService` (a new localStorage module), extends `AuthContext` with an `isGuest` flag and post-login merge flow, adds `mergeGuestData` to `dbService`, and updates `page.tsx` and `auth/page.tsx` to render correctly for unauthenticated visitors.

The design uses TypeScript (Next.js App Router). All property-based tests use **fast-check**; unit tests use **Jest** (or Vitest with `--run`). `fast-check` must be installed as a dev dependency before any test task runs.

---

## Tasks

- [x] 1. Install fast-check and configure test environment
  - Run `npm install --save-dev fast-check` to add the PBT library
  - Confirm Jest or Vitest is available (check `package.json`); if neither exists, install `jest` + `ts-jest` + `@types/jest` as dev dependencies and add a `jest.config.ts` pointing at `src/**/*.test.ts?(x)`
  - Add a `test` script to `package.json` if one does not already exist
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 2. Implement `GuestDataService` (`src/lib/guestDataService.ts`)
  - [x] 2.1 Create `src/lib/guestDataService.ts` with the `GuestData` interface and all five service methods
    - Export `interface GuestData { max_streak: number; current_streak: number; completions: Record<string, string>; }`
    - Implement `read(): GuestData | null` — parses `localStorage.getItem('dsa_tracker_guest_data')`; returns `null` on absence or parse failure
    - Implement `write(data: GuestData): void` — serialises and writes to `localStorage`
    - Implement `clear(): void` — calls `localStorage.removeItem('dsa_tracker_guest_data')`
    - Implement `addCompletion(problemId: string): void` — reads (or initialises default), adds entry with `new Date().toISOString()`, recalculates streaks via `calculateStreaks` from `db.ts`, writes back
    - Implement `removeCompletion(problemId: string): void` — same pattern but deletes the entry before recalculating
    - Wrap every `localStorage` call in `try/catch`; on first failure switch to an in-memory fallback (`let _memoryStore: GuestData | null`) for the session; never throw to callers
    - The `calculateStreaks` adapter maps `GuestData.completions` entries to `UserCompletion[]` shape: `{ id: problemId, user_id: 'guest', problem_id: problemId, completed_at: timestamp }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [-] 2.2 Write property test for GuestDataService round-trip (Property 1)
    - **Property 1: GuestDataService round-trip** — for any valid `GuestData`, `write(data)` then `read()` returns a deeply equal object
    - Generate arbitrary `GuestData`: use `fc.record({ max_streak: fc.nat(), current_streak: fc.nat(), completions: fc.dictionary(fc.uuid(), fc.date({ noInvalidDate: true }).map(d => d.toISOString())) })`
    - Reset `_memoryStore` and clear `localStorage` before each run; mock `localStorage` with a simple in-memory map if running in Node
    - Run minimum 100 iterations
    - Tag: `// Feature: guest-mode-auth, Property 1: GuestDataService round-trip`
    - **Validates: Requirements 2.1**

  - [-] 2.3 Write property test for add/remove round-trip (Property 2)
    - **Property 2: Completion add/remove round-trip** — for any non-empty `problemId`, `addCompletion(id)` then `removeCompletion(id)` leaves `completions` identical to its pre-call state
    - Seed `GuestDataService` with arbitrary initial completions using `fc.dictionary(...)` before each run
    - Assert deep equality of the `completions` map before and after the paired calls
    - Tag: `// Feature: guest-mode-auth, Property 2: Completion add/remove round-trip`
    - **Validates: Requirements 2.2, 2.3**

  - [-] 2.4 Write property test for guest streak agreement with calculateStreaks (Property 3)
    - **Property 3: Guest streak values agree with calculateStreaks** — for any set of completion timestamps written through `GuestDataService`, the stored `current_streak` and `max_streak` equal the output of `calculateStreaks()` on the same entries
    - Generate arbitrary arrays of ISO timestamp strings; write them as completions; compare `GuestDataService.read()` streak fields against direct `calculateStreaks()` output
    - Tag: `// Feature: guest-mode-auth, Property 3: Guest streak agreement`
    - **Validates: Requirements 2.4, 5.1**

- [x] 3. Add `mergeGuestData` to `dbService` (`src/lib/db.ts`)
  - [x] 3.1 Implement `dbService.mergeGuestData(userId, guestData)` method
    - Import `GuestData` from `guestDataService.ts`
    - **Supabase path**: batch-upsert all entries via `supabase.from('user_completions').upsert(rows, { onConflict: 'user_id,problem_id', ignoreDuplicates: true })`; after upsert, fetch all completions for the user, recalculate streaks with `calculateStreaks`, and update `user_profiles` (same pattern as `toggleCompletion`)
    - **MockMode path**: load `dsa_mock_completions_<userId>` array; for each guest `problem_id` insert only if absent; recalculate and persist streaks to the mock profile
    - Return `{ success: true }` on completion; `{ success: false, error: message }` on failure
    - _Requirements: 4.3, 4.4_

  - [x] 3.2 Write property test for mergeGuestData upsert correctness (Property 6)
    - **Property 6: mergeGuestData upsert correctness** — for any guest completions and any pre-existing MockMode records, after `mergeGuestData` completes: (1) every pre-existing record is unchanged, (2) every guest-only problem ID is now present, (3) no extra records exist
    - Test only the MockMode path to avoid Supabase calls; generate arbitrary disjoint and overlapping sets with `fc.set(fc.string())`
    - Tag: `// Feature: guest-mode-auth, Property 6: mergeGuestData upsert correctness`
    - **Validates: Requirements 4.4**

- [~] 4. Checkpoint — unit test the pure logic layer
  - Ensure all tests from tasks 2 and 3 pass before continuing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Update `AuthContext` (`src/context/AuthContext.tsx`)
  - [-] 5.1 Add `isGuest` state and remove the unauthenticated redirect
    - Add `const [isGuest, setIsGuest] = useState(false)` to the provider
    - Add `isGuest: boolean` to `AuthContextType` interface
    - In the initial `refreshProfile` callback: replace `if (!profile && pathname !== '/auth') { router.push('/auth'); }` with `if (!profile) { setIsGuest(true); }` — no redirect
    - When `refreshProfile` returns a valid profile, also call `setIsGuest(false)`
    - Export `isGuest` in the context value object
    - _Requirements: 1.1_

  - [-] 5.2 Wire post-login guest merge into `login` and `signup`
    - Import `GuestDataService` from `@/lib/guestDataService`
    - In both `login` and `signup`, after `refreshProfile()` returns a valid `UserProfile`, insert the merge block:
      ```typescript
      const guestData = GuestDataService.read();
      if (guestData && Object.keys(guestData.completions).length > 0) {
        try {
          await dbService.mergeGuestData(profile.id, guestData);
          GuestDataService.clear();
          await refreshProfile();
        } catch (err) {
          console.error('[guest-merge] merge failed, guest data preserved:', err);
        }
      }
      ```
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 5.3_

  - [-] 5.3 Update `logout` to return to guest state at `/`
    - After `signOut()`, call `setIsGuest(true)` and `router.push('/')` instead of `router.push('/auth')`
    - _Requirements: 1.1_

  - [x] 5.4 Update `onAuthStateChange` SIGNED_OUT handler
    - On `SIGNED_OUT`, set `isGuest(true)` and push to `/` instead of `/auth`
    - _Requirements: 1.1_

- [ ] 6. Update `Auth_Page` (`src/app/auth/page.tsx`)
  - [-] 6.1 Add `isGuest` consumption and `?intent=signin` guard
    - Destructure `isGuest` from `useAuth()`
    - Since `auth/page.tsx` is a Client Component that will call `useSearchParams`, wrap the inner component that reads search params in a `<Suspense>` boundary — required by this Next.js version to avoid a build failure (the build will error with "Missing Suspense boundary with useSearchParams" if omitted)
    - Pattern: extract the redirect logic into an inner `AuthRedirectGuard` client component that calls `useSearchParams()`; render it inside `<Suspense fallback={null}>` within `AuthPage`
    - In `AuthRedirectGuard`: read `const intentSignin = searchParams.get('intent') === 'signin'`
    - Extend the existing redirect `useEffect`:
      - If `user !== null`: push to `/`
      - Else if `isGuest && !intentSignin`: push to `/` (guest typed the URL directly)
      - Else if `isGuest && intentSignin`: do nothing — show the auth form
    - _Requirements: 1.4, 1.5_

- [x] 7. Update `Home_Page` (`src/app/page.tsx`)
  - [x] 7.1 Remove the unauthenticated redirect and add guest data loading
    - Remove the `useEffect` that calls `router.push('/auth')` when `!loading && !user`
    - Destructure `isGuest` from `useAuth()`
    - Add `guestStreaks` state: `const [guestStreaks, setGuestStreaks] = useState({ current: 0, max: 0 })`
    - Add `loadGuestData` function: calls `dbService.getProblems()`, initialises `completions` map from `GuestDataService.read()?.completions ?? {}`, and sets `guestStreaks` from `GuestDataService.read()`
    - Replace the existing data-loading `useEffect` with one that branches: `if (user?.id) { loadData(user.id); } else if (isGuest) { loadGuestData(); }`
    - _Requirements: 1.2, 2.5_

  - [x] 7.2 Update `handleCheckboxToggle` for guest path
    - At the top of `handleCheckboxToggle`, add a guest branch:
      ```typescript
      if (isGuest) {
        setCompletions(prev => ({ ...prev, [problemId]: true }));
        GuestDataService.addCompletion(problemId);
        const updated = GuestDataService.read();
        if (updated) setGuestStreaks({ current: updated.current_streak, max: updated.max_streak });
        return;
      }
      ```
    - Leave the existing authenticated path unchanged
    - _Requirements: 2.2, 2.4, 5.1_

  - [x] 7.3 Update header rendering for guest vs authenticated controls
    - Replace the existing header navigation block with a conditional:
      ```tsx
      {isGuest ? (
        <button onClick={() => router.push('/auth?intent=signin')} className="...">
          Sign In / Sign Up
        </button>
      ) : (
        <>
          {isAdmin && <button onClick={() => setShowAdminModal(true)}>Add Problem</button>}
          <button onClick={() => router.push('/profile')}>Profile</button>
          <button onClick={logout}>Logout</button>
        </>
      )}
      ```
    - Apply the cyberpunk styling tokens already used in the header (border, font-chakra, text-cyan, uppercase, tracking-wider, cyber-transition)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 7.4 Update sidebar user bio card for guest display
    - Derive display values:
      ```typescript
      const displayName    = isGuest ? 'Guest' : user!.display_name;
      const displayEmail   = isGuest ? ''       : user!.email;
      const currentStreak  = isGuest ? guestStreaks.current : user!.current_streak;
      const maxStreak      = isGuest ? guestStreaks.max     : user!.max_streak;
      ```
    - Replace direct `user.*` references in the bio card JSX with the derived variables
    - Conditionally hide the email `<p>` when `displayEmail` is empty
    - _Requirements: 3.4, 5.1_

  - [x] 7.5 Update the loading and null-user guard at the bottom of the render function
    - Change the loading guard: `if (loading || (user && dataLoading && problems.length === 0))` — keep as-is (already correct)
    - Remove `if (!user) return null` — guests are allowed to render; replace with `if (!isGuest && !user) return null` to guard only the unexpected unauthenticated non-guest state
    - _Requirements: 1.2, 1.6_

- [~] 8. Checkpoint — integration smoke test
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Write unit tests for AuthContext and page-level behaviour
  - [ ] 9.1 Write unit tests for AuthContext guest initialisation
    - Assert: when `dbService.getCurrentUser()` resolves to `null`, `isGuest` is `true` and `router.push` is NOT called
    - Assert: after a successful `login`, `GuestDataService.read` is always called, regardless of whether guest data exists
    - Assert: after successful login with no guest completions, `mergeGuestData` is NOT called
    - Assert: after successful login with guest completions, `mergeGuestData` IS called, then `GuestDataService.clear()`, then `refreshProfile()`
    - Assert: if `mergeGuestData` throws, error is logged with `[guest-merge]` prefix, `router.push('/')` still fires, `GuestDataService.clear()` is NOT called
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 9.2 Write unit tests for Auth_Page redirect logic
    - Assert: authenticated user (`user !== null`) is redirected to `/`
    - Assert: guest without `?intent=signin` is redirected to `/`
    - Assert: guest with `?intent=signin` is NOT redirected (auth form is shown)
    - _Requirements: 1.4, 1.5_

  - [-] 9.3 Write unit tests for Home_Page header and sidebar rendering
    - Assert: when `isGuest=true`, "Sign In / Sign Up" button renders and Profile/Logout/Add Problem buttons do NOT render
    - Assert: when `isGuest=false` and `user` is set, Profile and Logout buttons render and "Sign In / Sign Up" does NOT render
    - Assert: after successful login, `isGuest` becomes `false` and header transitions to authenticated controls
    - Assert: sidebar shows `displayName='Guest'` and streak values from `guestStreaks` when `isGuest=true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 10. Write property tests for Home_Page rendering
  - [-] 10.1 Write property test for Home_Page problem row count in guest mode (Property 4)
    - **Property 4: Home_Page renders all problems in guest mode** — for any `Problem[]` returned by a mocked `dbService.getProblems()`, rendering `Home_Page` with `isGuest=true` produces exactly that many problem rows (zero items shows the empty-state element)
    - Use `fc.array(fc.record({ id: fc.uuid(), topic: fc.string(), day_number: fc.nat({min:1}), problem_name: fc.string(), link_1: fc.webUrl() }))`
    - Tag: `// Feature: guest-mode-auth, Property 4: Home_Page renders all problems in guest mode`
    - **Validates: Requirements 1.2, 1.6**

  - [-] 10.2 Write property test for guest completions reflected on mount (Property 5)
    - **Property 5: Guest completions reflected in UI on mount** — for any `completions` map in `GuestData`, checkboxes for those problem IDs are rendered in the checked state when `Home_Page` mounts in guest mode
    - Seed `GuestDataService` with arbitrary completions before rendering; assert `input[type=checkbox][checked]` count equals `Object.keys(completions).length`
    - Tag: `// Feature: guest-mode-auth, Property 5: Guest completions reflected on mount`
    - **Validates: Requirements 2.5**

  - [-] 10.3 Write property test for sidebar streak display (Property 7)
    - **Property 7: Sidebar streak display matches source data** — for any `(current_streak, max_streak)` pair, the sidebar renders exactly those values whether sourced from `guestStreaks` (guest mode) or `UserProfile` (authenticated mode)
    - Generate `fc.tuple(fc.nat(), fc.nat())` for streak pairs; render in both modes; assert rendered text matches
    - Tag: `// Feature: guest-mode-auth, Property 7: Sidebar streak display matches source data`
    - **Validates: Requirements 3.4, 5.1, 5.2**

- [~] 11. Final checkpoint — full test suite
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check (install in task 1); unit tests use Jest or Vitest
- `useSearchParams` in `auth/page.tsx` **must** be inside a `<Suspense>` boundary — this Next.js version (16.x) will fail the production build otherwise (see Next.js docs: "Missing Suspense boundary with useSearchParams")
- The `dsa_tracker_guest_data` localStorage key is separate from all `dsa_mock_*` keys; the two namespaces must never overlap
- The merge strategy is "server wins": existing server records are never overwritten by guest data
- `GuestDataService` has no Supabase dependency — it must only import from `db.ts` (for `calculateStreaks`)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["6.1", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "10.1", "10.2", "10.3"] }
  ]
}
```
