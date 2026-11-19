# Firestore Security Specification — Touchline XI

## 1. Data Invariants
1. **Identity & Role Integrity**: Users can create their own `/users/{userId}` document ONLY with `role == 'manager'`, `status == 'active'`, and `uid == request.auth.uid`. Self-escalation to `role == 'admin'` is forbidden unless the user is already an Admin.
2. **PII Isolation**: Emails and personal account preferences are strictly isolated in `/users/{userId}/private/{docId}` and readable/writable only by `isOwner(userId)` or `isAdmin()`.
3. **Career Ownership**: `/careers/{userId}` can only be read, created, or updated by `isOwner(userId)` or `isAdmin()`, and `uid` is immutable after creation.
4. **Admin-Only Content & Broadcasts**: `/news/{newsId}`, `/notifications/{notifId}`, and `/marketOverrides/{playerId}` are readable by signed-in users (`isSignedIn()`), and writable strictly by `isAdmin()`.
5. **Verified Email Mandate**: Standard writes require `request.auth.token.email_verified == true`.
6. **Bootstrapped Admin**: `request.auth.token.email == 'nguyendai.thqv@gmail.com' && request.auth.token.email_verified == true` or existence of `/admins/$(request.auth.uid)`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Escalation**: Creating `/users/attacker` with `{ role: "admin", status: "active", ... }`.
2. **Shadow Field Injection**: Updating `/users/attacker` with `{ managerName: "Valid", ghostFlag: true }`.
3. **Unverified Admin Spoof**: Calling `/news/1` create with `email: "nguyendai.thqv@gmail.com"` and `email_verified: false`.
4. **Cross-User Career Tampering**: User A reading or writing `/careers/userB`.
5. **PII Blanket Read**: User A calling `get` or `list` on `/users/userB/private/account`.
6. **ID Poisoning**: Creating `/news/1500_char_junk_id...` exceeding 128 chars or containing invalid characters (`../`).
7. **Denial of Wallet String Bomb**: Writing a 50KB `title` to `/news/n1` or `managerName` to `/users/u1`.
8. **Immutable Field Mutation**: Updating `/users/u1` while modifying `createdAt` or `uid`.
9. **Unauthorized News Publish**: Non-admin manager attempting to create or delete `/news/{newsId}`.
10. **Unauthorized Push Broadcast**: Non-admin manager attempting to write to `/notifications/{notifId}`.
11. **Fake Activity Attribution**: User A writing `/activityLogs/log1` with `uid: "userB"`.
12. **Status Un-suspension Bypass**: Suspended user attempting to update their own `/users/{uid}` `status` field from `"suspended"` back to `"active"`.
