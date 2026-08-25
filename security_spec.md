# Security Spec: Canonical Users and Team Management

## Data Invariants
1. A user document belongs to a specific `uid` matching the document ID.
2. A user with `accountType != 'CLIENT'` MUST have a `restaurantId` string field.
3. Only the user themselves can read their own document by default.
4. Internal users (e.g. `OWNER`, `MANAGER`, `WAITER`) can read other users in the same `restaurantId`.
5. Frontend clients cannot modify protected fields (role, status, permissions, accountType, restaurantId) for any user, not even themselves, as these must go through the backend Admin SDK.
6. `CLIENT` users cannot read internal users (unless it's their own profile, wait, CLIENTs are not internal users).
7. Audit collections (e.g. `audit_logs` or `integration_logs`) must be immutable from the frontend (read-only for allowed roles, or completely locked down).

## The Dirty Dozen (Test Payloads)
1. `USER_READS_SELF`: Authenticated user reading their own document. (Allowed)
2. `OWNER_LISTS_TEAM`: `OWNER` of `restaurantId = 'rest1'` reading users with `restaurantId = 'rest1'`. (Allowed)
3. `USER_READS_OTHER_REST`: User from `rest1` attempting to read users from `rest2`. (Denied)
4. `MANAGER_PROMOTES_ADMIN`: `MANAGER` trying to `update` a user's role to `RESTAURANT_ADMIN` from the frontend. (Denied, backend required)
5. `WAITER_EDITS_TEAM`: `WAITER` trying to edit another team member's profile. (Denied)
6. `USER_CHANGES_REST_ID`: User trying to update their own `restaurantId`. (Denied)
7. `USER_SELF_PROMOTES`: User trying to change their own `role`. (Denied)
8. `USER_ACTIVATES_SELF`: User trying to change their own `status` to `ACTIVE`. (Denied)
9. `FRONTEND_WRITES_PROTECTED`: Frontend trying to write protected fields. (Denied)
10. `BACKEND_OPERATES`: Firebase Admin SDK bypassing rules to manage users. (Allowed, inherent to Admin SDK)
11. `CLIENT_READS_TEAM`: `CLIENT` trying to read internal users. (Denied)
12. `EDIT_AUDIT_LOGS`: Frontend attempting to create/update/delete an audit log. (Denied)

## Test Runner Plan
We will use `@firebase/rules-unit-testing` to validate these exact 12 rules in `firestore.rules.test.ts`. We will set up mock authenticated contexts for a CLIENT, an OWNER, a MANAGER, a WAITER, and unauthenticated users. We will attempt reads and writes against the `users` collection to verify the new constraints.
