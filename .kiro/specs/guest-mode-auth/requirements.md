# Requirements Document

## Introduction

This feature introduces a "Guest Mode First" experience to the DSA Tracker — a Next.js application for tracking progress through a curated DSA curriculum. Currently, all routes are gated behind authentication; unauthenticated visitors are immediately redirected to `/auth`. This feature removes that wall: guests land directly on the home page, interact with the curriculum using browser `localStorage` for persistence, and seamlessly migrate their progress into a real account upon sign-in or sign-up. The feature spans three files of primary concern — `AuthContext.tsx`, `db.ts`, and `page.tsx` — and introduces a new `GuestDataService` for isolated guest-state management.

---

## Glossary

- **Guest**: An unauthenticated visitor with no active session cookie or Supabase auth token.
- **Authenticated_User**: A visitor with an active session, identified by a `UserProfile` object in `AuthContext`.
- **GuestDataService**: The new client-side service responsible for reading and writing the `dsa_tracker_guest_data` `localStorage` key.
- **GuestData**: The JSON object stored at the `dsa_tracker_guest_data` `localStorage` key, containing `max_streak`, `current_streak`, and a `completions` map.
- **Completion_Entry**: A single key-value pair inside `GuestData.completions` where the key is a `problem_id` string and the value is an ISO 8601 UTC timestamp string.
- **Upsert**: An insert-or-ignore operation applied during data migration: if a `problem_id` already exists in the authenticated user's completion records, the existing server-side record is preserved and the guest record for that problem is discarded.
- **AuthContext**: The React context defined in `src/context/AuthContext.tsx` that manages session state and exposes `user`, `loading`, `login`, `signup`, and `logout`.
- **dbService**: The data service exported from `src/lib/db.ts` that abstracts Supabase and mock-localStorage backends.
- **Home_Page**: The page component at `src/app/page.tsx`.
- **Auth_Page**: The page component at `src/app/auth/page.tsx`.
- **MockMode**: The application state when `isSupabaseConfigured` is `false`, causing `dbService` to fall back to mock `localStorage` keys (`dsa_mock_*`).

---

## Requirements

### Requirement 1: Guest Mode Access to Home Page

**User Story:** As an unauthenticated visitor, I want to view the complete DSA curriculum on the Home Page without being redirected to a sign-in wall, so that I can evaluate the application and begin tracking progress immediately.

#### Acceptance Criteria

1. WHERE a session cookie or Supabase auth token is absent, THE `AuthContext` SHALL set `user` to `null` and expose a new boolean flag `isGuest` as `true` without redirecting to `/auth`.
2. WHEN the `Home_Page` mounts and `user` is `null` and `isGuest` is `true`, THE `Home_Page` SHALL load and display the full problem curriculum fetched via `dbService.getProblems()`.
3. WHILE `isGuest` is `true`, THE `Home_Page` header SHALL display a "Sign In / Sign Up" button in the top-right position where the Profile and Logout buttons currently appear for authenticated users.
4. WHEN the `Auth_Page` mounts and `user` is not `null`, THE `Auth_Page` SHALL redirect to `/` unconditionally, regardless of how the user navigated to `/auth`.
5. WHEN the `Auth_Page` mounts and `user` is `null` and `isGuest` is `true`, THE `Auth_Page` SHALL redirect to `/` so guests land directly on the curriculum rather than the sign-in form.
6. IF `dbService.getProblems()` returns an empty array while the user is a guest, THEN THE `Home_Page` SHALL display the same empty-state message that authenticated users see.

---

### Requirement 2: Guest Mode Completion State and Local Persistence

**User Story:** As a guest user tracking my progress, I want my problem completions, current streak, and max streak saved in my browser's localStorage, so that my data survives page refreshes and return visits within the same browser.

#### Acceptance Criteria

1. THE `GuestDataService` SHALL read and write a single `localStorage` key named `dsa_tracker_guest_data` containing a JSON object that conforms to the following shape: `{ "max_streak": number, "current_streak": number, "completions": { "<problem_id>": "<ISO8601_UTC_timestamp>" } }`.
2. WHEN a guest checks a problem checkbox, THE `GuestDataService` SHALL add an entry to `GuestData.completions` keyed by the problem's `id` with the value set to `new Date().toISOString()`.
3. WHEN a guest unchecks a problem checkbox, THE `GuestDataService` SHALL delete the entry for that problem's `id` from `GuestData.completions`.
4. WHEN `GuestData.completions` is modified or any other write operation is performed on `GuestData`, THE `GuestDataService` SHALL recalculate `current_streak` and `max_streak` using the same `calculateStreaks` algorithm already exported from `src/lib/db.ts`, then persist the updated values back into `dsa_tracker_guest_data`.
5. WHEN the `Home_Page` mounts with `isGuest` equal to `true`, THE `Home_Page` SHALL initialise the `completions` display state from `GuestDataService.read()` so previously checked problems appear checked after a page refresh.
6. IF `localStorage` is unavailable (e.g., private browsing with storage blocked), THEN THE `GuestDataService` SHALL catch the resulting exception and operate with an in-memory fallback for the current session without throwing to the caller.

---

### Requirement 3: Guest Mode Header UI

**User Story:** As a guest, I want a clearly visible and styled "Sign In / Sign Up" button in the application header, so that I can easily navigate to the authentication page when I am ready to create an account.

#### Acceptance Criteria

1. WHILE `isGuest` is `true`, THE `Home_Page` header SHALL render a single button labelled `"Sign In / Sign Up"` in the top-right slot, styled consistently with the existing cyberpunk design system (border, font, colour tokens already used in `page.tsx`).
2. WHEN a guest clicks the `"Sign In / Sign Up"` button, THE `Home_Page` SHALL keep the guest UI controls visible and only replace them with authenticated controls after the `/auth` navigation has completed and the user has successfully signed in.
3. WHILE `isGuest` is `true`, THE `Home_Page` header SHALL NOT render the Profile button, the Logout button, the admin "Add Problem" button, or any other control that assumes an authenticated session, regardless of any other state.
4. WHILE `isGuest` is `true`, THE `Home_Page` left sidebar user bio card SHALL display placeholder identity values (e.g., display name `"Guest"`, streak values sourced from `GuestDataService.read()`) instead of authenticated `UserProfile` fields.

---

### Requirement 4: Post-Authentication Data Migration

**User Story:** As a guest who decides to sign in or sign up, I want all the progress I tracked as a guest to be automatically transferred to my account, so that I do not lose the work I completed before creating an account.

#### Acceptance Criteria

1. WHEN `AuthContext.login` or `AuthContext.signup` completes successfully and `user` transitions from `null` to a valid `UserProfile`, THE `AuthContext` SHALL always invoke `GuestDataService.read()` to check for pending guest data before navigating away from `/auth`, even when no prior guest session existed.
2. IF `GuestDataService.read()` returns `null` or a `GuestData` object with zero entries in `completions`, THEN THE `AuthContext` SHALL skip the merge step and proceed directly to navigation without error.
3. IF `GuestDataService.read()` returns a `GuestData` object with one or more entries in `completions`, THEN THE `AuthContext` SHALL call a new `dbService.mergeGuestData(userId, guestData)` method to migrate completions to the authenticated user's record.
4. THE `dbService.mergeGuestData` method SHALL iterate over each `problem_id` in `GuestData.completions` and perform an upsert: if the `problem_id` does not already exist in the user's completion records, it SHALL be inserted with its guest-recorded timestamp; if it already exists, the existing record SHALL be preserved unchanged.
5. WHEN `dbService.mergeGuestData` completes without error, THE `AuthContext` SHALL call `GuestDataService.clear()` to delete the `dsa_tracker_guest_data` key from `localStorage`.
6. IF `dbService.mergeGuestData` throws or returns an error, THEN THE `AuthContext` SHALL log the error to the console and still navigate the user to `/`, preserving the guest data in `localStorage` for a potential retry on the next login.
7. WHEN the user successfully authenticates, THE header SHALL display exactly the authenticated-user controls (Profile button and Logout button) with no overlap or simultaneous visibility of the "Sign In / Sign Up" button.
8. WHEN `GuestData` contains zero entries in `completions`, THE `AuthContext` SHALL skip the merge step entirely and proceed directly to navigation.

---

### Requirement 5: Streak Display for Guest and Authenticated Users

**User Story:** As a guest or authenticated user, I want my current and maximum streaks displayed accurately in the UI, so that I can see my progress at a glance.

#### Acceptance Criteria

1. WHILE `isGuest` is `true`, THE `Home_Page` sidebar SHALL display `current_streak` and `max_streak` values sourced from `GuestDataService.read()`.
2. WHEN an authenticated user's streak values are updated by `dbService.toggleCompletion`, THE `Home_Page` SHALL reflect the updated `current_streak` and `max_streak` in the sidebar without requiring a full page reload, consistent with the existing optimistic-update pattern.
3. WHEN guest data is successfully merged into an authenticated account via `dbService.mergeGuestData`, THE `AuthContext` SHALL call `refreshProfile()` so that the `Home_Page` renders the merged streak values from the server.
