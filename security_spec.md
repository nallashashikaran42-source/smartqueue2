# SmartQueue Firestore Security Specification

## 1. Data Invariants
1. **Identity & Ownership**: Every `/users/{userId}` document must have `uid == userId == request.auth.uid` (unless written by an admin) and `request.auth.token.email_verified == true`.
2. **No Self-Assigned Roles**: Publicly creating `/users/{userId}` locks `role == 'citizen'`, `accountStatus == 'active'`, and `trustScore == 95`. Non-admins cannot alter `role`, `accountStatus`, or `trustScore`.
3. **PII Isolation (Split Collection)**: Sensitive fields (`email`, `phone`) live exclusively in `/users/{userId}/private/info` and are readable/writable only by the owning verified user or an admin.
4. **Master Gate & Active Account**: Subcollections (`/users/{userId}/private/info` and `/users/{userId}/tickets/{ticketId}`) validate parent `/users/{userId}` existence and `accountStatus == 'active'` on writes.
5. **Terminal State Locking**: Queue tickets reaching terminal statuses (`Completed`, `Cancelled`, `Skipped`, `NoShow`) cannot be modified by non-admin users.
6. **Temporal & Structural Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, `createdAt` is immutable on updates, `updatedAt == request.time` on updates, and strict `hasAll` / `hasOnly` + `affectedKeys().hasOnly()` checks block shadow fields.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Assigned Admin Role on Signup**: Creating `/users/u1` with `{ role: 'admin', ... }` as a normal user -> `PERMISSION_DENIED`.
2. **Shadow Field Injection ("Ghost Field")**: Creating `/users/u1` with an extra `{ isVerified: true }` field -> `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: Writing to `/users/u1` or `/admins/u1` with `email: 'shahsikarnann@gmail.com'` and `email_verified: false` -> `PERMISSION_DENIED`.
4. **PII Cross-User Read**: User `u2` attempting `get` on `/users/u1/private/info` -> `PERMISSION_DENIED`.
5. **Cross-User Ticket Forgery**: User `u2` attempting to create `/users/u1/tickets/A-99` -> `PERMISSION_DENIED`.
6. **Ticket Terminal State Tampering**: User `u1` attempting to update a `Completed` ticket back to `Waiting` -> `PERMISSION_DENIED`.
7. **ID Poisoning (Oversized/Invalid ID)**: Creating `/users/u1/tickets/invalid$id...150chars` -> `PERMISSION_DENIED`.
8. **Client-Forged Timestamp**: Creating `/users/u1` with a backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Immutable Field Mutation**: Updating `/users/u1/tickets/A-42` to change `queueId` or `uid` -> `PERMISSION_DENIED`.
10. **Orphaned Subcollection Write**: Creating `/users/ghost/private/info` when `/users/ghost` does not exist -> `PERMISSION_DENIED`.
11. **Non-Admin Creating Admin Marker**: User `u1` attempting to create `/admins/u1` -> `PERMISSION_DENIED`.
12. **Blanket List Scraping**: Unauthenticated or cross-user `list` query on `/users` or `/users/u1/tickets` -> `PERMISSION_DENIED`.
