# Google Sign-In: Implementation Specification

This is the authoritative specification for implementing Google Sign-In.
Read it before writing any code. Read the full document — not sections in isolation.

---

## 0. Architecture Philosophy

**Solve today's requirements well.** Do not solve hypothetical future problems.

| Rejected Abstraction | Reason | Status |
|---|---|---|
| Provider / identity tables | 2 providers (LOCAL + GOOGLE) do not justify multi-table abstraction | Rejected per architecture review |
| Avatar storage | App does not display avatars | Postponed indefinitely |
| In-memory replay tracking | Breaks in multi-instance/serverless | Rejected — rely on unique constraints + short TTL |
| Provider-agnostic framework (NextAuth/Passport) | Would replace entire working auth system | Rejected — google-auth-library does exactly what is needed |
| `GOOGLE_CLIENT_SECRET` env var | Our flow uses popup-based GIS + ID token verification. The client secret is only needed for server-side code exchange (redirect flow) or Google API calls. Neither applies here. | Removed from spec — unused |

**Principle:** Google Sign-In extends the existing JWT + httpOnly cookie + RBAC + approval workflow system. It does not replace it.

---

## 1. Schema — Minimal, Justified

```prisma
model User {
  id          Int        @id @default(autoincrement())
  name        String
  email       String     @unique
  phone       String?
  password    String                    // UNCHANGED — see password model decision below
  role        Role       @default(STUDENT)
  uid         String?    @unique
  googleId    String?    @unique         // NEW: Google OAuth immutable user ID (sub claim)
  isVerified  Boolean    @default(false)
  status      UserStatus @default(ACTIVE)
  industryId  Int?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([googleId])                    // NEW: O(1) lookup on Google sign-in
  @@index([industryId])
}
```

**`googleId String? @unique`** — The only new field. Maps a Google account to a local user. `@unique` prevents one Google account being linked to multiple users. Nullable because local users don't have one.

**`password String` (unchanged)** — NOT made nullable. See Section 1a for the full analysis.

### 1a. Password Model Decision

**Chosen: Option B — Generate a cryptographically secure random password for Google-only users.**

**Rejected: Option A — Nullable password (`String?`).**

| Aspect | Option A (Nullable) | Option B (Random PW) | Verdict |
|---|---|---|---|
| Schema migration | `ALTER COLUMN...DROP NOT NULL` | **None** | Option B wins |
| Data migration | None | None | Tie |
| Code audit required | ~10 files (every password access) | **Zero files** | Option B wins |
| New guard clauses | 3 (login, forgot, reset) | **1** (login — distinguish Google user from bad password) | Option B wins |
| bcrypt cost for Google reg | None | ~100ms (one-time, 12 rounds) | Negligible difference |
| Forgot/reset UX | Special case for null | **Works unchanged** | Option B wins |
| Rollback complexity | Must handle null values in DB | **No changes to roll back** | Option B wins |
| Developer footgun | "password might be null" everywhere | "password is always present" — familiar | Option B wins |
| Distinguish Google-only from dual-provider | `password === null` means Google-only | Needs `user.googleId && !isMatch` in login route | Slightly better for Option A |

**Why Option B is the right choice for this project:**

1. **Zero schema migration risk.** Adding a nullable column to a production table is straightforward but carries operational risk (ORM regeneration, query plan changes, application code assumptions). Option B avoids this entirely.

2. **Zero code audit burden.** Every existing `user.password` access continues to work. There are no null checks to add, no crashes to prevent, no assumption violations.

3. **Forgot/reset password flows work identically for all users.** A Google-only user can receive a password reset OTP, set a password, and become a dual-provider user. This is a feature, not a bug — it provides a recovery path without a separate "Set Password" flow.

4. **Backward compatible.** Existing code expecting `String` continues to compile and run. Rollback requires no data migration.

5. **The "lie" is invisible.** The random hash is stored but never exposed, never verified against user input, and never used for authentication. It exists solely to satisfy the NOT NULL constraint.

**The one tradeoff:** In the login route, when a Google-only user enters their email and a random password, `bcrypt.compare` returns false. Without additional logic, the user sees "Invalid email/UID or password." To provide better UX, add a single check:

```typescript
if (!isMatch && user.googleId) {
  return errorRes('Invalid credentials. Try signing in with Google.', [], 400);
}
```

This handles all three cases correctly:
- Google-only user entering email + anything → "Try signing in with Google"
- Dual-provider user mistyping password → "Try signing in with Google" (they can also retry with correct password)
- Local-only user entering wrong credentials → "Invalid email/UID or password" (unchanged)

---

## 2. Registration Flow

### 2.1 Google Identity Verification (POST /api/auth/google)

```
Frontend                          Backend
  │                                  │
  │  POST { credential }             │
  │─────────────────────────────────>│
  │                                  │  verifyIdToken(credential)
  │                                  │  validate aud, iss, exp
  │                                  │  extract sub, email, email_verified, name
  │                                  │  check email_verified === true
  │                                  │  check domain === ALLOWED_EMAIL_DOMAIN
  │                                  │  check googleId in DB
  │                                  │  check email in DB
  │                                  │
  │  { action, error?, data? }       │
  │<─────────────────────────────────│
```

**Response actions:**

| Action | Condition | Frontend Behavior |
|---|---|---|
| `login` | googleId exists + status = ACTIVE | `window.location.assign(destination)` |
| `register` | New email, not in DB | Redirect to `/register/complete`. Backend sets `pending_reg` cookie. |
| `link_prompt` | Email exists (Student or Faculty/Admin ACTIVE) + no googleId yet | Show confirmation dialog |
| `pending` | Email exists + status = PENDING | Show: "Your account is awaiting administrator approval." |
| `rejected` | Email exists + status = REJECTED | Show: "Your account registration was rejected." |
| `invalid_domain` | Email domain mismatch | Show domain requirement |
| `disabled` | GOOGLE_SIGNIN_ENABLED is false | 404 |

### 2.2 Registration Completion (POST /api/auth/register/google)

```
1. Read `pending_reg` cookie
2. Verify JWT signature (GOOGLE_REGISTRATION_SECRET)
3. Verify JWT not expired (15 min)
4. Validate form body: { name, uid, phone }
5. Generate random password: `crypto.randomBytes(32).toString('hex')` → `bcrypt.hash(randomPw, 12)`
6. Prisma transaction:
   a. Check email not taken
   b. Check uid not taken
   c. Check googleId not taken
   d. CREATE user { email, name, uid, phone, password: hashedRandomPw, googleId, role: STUDENT, isVerified: true, status: ACTIVE }
   e. COMMIT
7. Clear `pending_reg` cookie
8. Generate 3 JWT tokens (reuse existing jwt.ts)
9. Set 3 httpOnly cookies (reuse existing cookie options)
10. `logActivity('GOOGLE_REGISTRATION_COMPLETED', { email, userId: user.id })`
11. `syncDashboardUser(user)` — fire and forget, never blocks
12. Return { success: true, data: { accessToken, user } }
```

**Transaction boundary — exactly these operations:**
```typescript
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const randomPw = crypto.randomBytes(32).toString('hex');
const hashedRandomPw = await bcrypt.hash(randomPw, 12);

const user = await prisma.$transaction(async (tx) => {
  const [emailUser, uidUser, gidUser] = await Promise.all([
    tx.user.findUnique({ where: { email } }),
    tx.user.findUnique({ where: { uid } }),
    tx.user.findUnique({ where: { googleId: sub } }),
  ]);
  if (emailUser) throw new ApiError('EMAIL_EXISTS', 409);
  if (uidUser) throw new ApiError('UID_EXISTS', 409);
  if (gidUser) throw new ApiError('GOOGLE_ALREADY_LINKED', 409);
  return tx.user.create({
    data: { email, name, uid, phone, password: hashedRandomPw, googleId: sub, role: 'STUDENT', isVerified: true, status: 'ACTIVE' },
  });
});

// Everything below is OUTSIDE the transaction — NEVER roll back a user
// because another service is unavailable:
logActivity('GOOGLE_REGISTRATION_COMPLETED', { email, userId: user.id });
syncDashboardUser(user).catch((err) => logActivity('DASHBOARD_SYNC_FAILED', { email, error: String(err) }));
```

### 2.3 Registration Failure UX

| Failure | Cookie Behavior | UX |
|---|---|---|
| Validation error (bad UID format, short phone) | `pending_reg` **preserved** | Show inline errors. User corrects and resubmits. No additional Google auth needed. |
| Expired `pending_reg` | Expired (self-cleared on read) | "Your session expired. Please start again." → Redirect to /login |
| Duplicate email (race condition) | `pending_reg` **preserved** (but useless — email now taken) | "This email was already registered while you were completing the form." → Redirect to login |
| Duplicate UID (race condition) | `pending_reg` **preserved** | "This UID is already registered." User can retry with different UID. |
| Network failure | `pending_reg` **preserved** | Toast: "Network error. Please try again." User retries. |

**`pending_reg` is cleared ONLY on successful user creation or token expiration.**

### 2.4 Browser Refresh Behavior

Refreshing the registration page:
1. `pending_reg` cookie persists (httpOnly, not cleared by refresh)
2. Form re-renders from JWT data: name prefilled, UID empty, phone empty
3. No additional Google authentication required — the JWT is still valid
4. User does not need to re-authenticate with Google

Limitation: UID and phone are lost on refresh (React state resets). The JWT only stores Google-verified data (sub, email, name). This is standard web behavior.

---

## 3. Registration JWT (`pending_reg`)

| Property | Value | Justification |
|---|---|---|
| Cookie name | `pending_reg` | Generic — not Google-specific. Works for future providers. |
| Signing secret | `GOOGLE_REGISTRATION_SECRET` (env var) | **Dedicated secret.** Registration tokens are a different security boundary (pre-auth) than access tokens (post-auth). Benefits: independent rotation, no blast radius overlap, clear mental model. |
| TTL | 15 minutes | Balance: long enough to fill a form, short enough to limit replay window. |
| Payload | `{ sub, email, name, iat, exp }` | No `jti`. Replay protection comes from unique constraints + short TTL + cookie clearing on success. |
| httpOnly | true | Prevents JavaScript access |
| SameSite | Strict | The `pending_reg` cookie is only needed for same-origin POST requests to `/api/auth/register/google`. It should NEVER be sent in a cross-site context. `Strict` is more restrictive than `Lax` and provides better CSRF protection for this specific cookie. Since the user is always on our domain when reaching `/register/complete` (redirected client-side after Google OAuth), `Strict` does not break any valid flow. |
| Secure | `COOKIE_SECURE === 'true'` | HTTPS only in production |

**Authentication invariant:** A valid `pending_reg` cookie proves the bearer completed Google OAuth within the last 15 minutes. It does NOT authenticate API access. The recipient of a valid registration still must pass all uniqueness checks inside a transaction.

---

## 4. Login Flow

### 4.1 Returning Google User

```
POST /api/auth/google
  → googleId exists → status = ACTIVE
  → Generate 3 JWT tokens
  → Set 3 httpOnly cookies
  → Return { action: "login", data: { accessToken, user } }
  → Client: window.location.assign(destination)
```

All existing login behavior is preserved. The same `generateAccessToken`, `generateRefreshToken`, `generateSharedToken` functions are called. The same cookie options are used.

**Response body includes `accessToken` and `user`**, matching the existing login endpoint contract. Even though the token is set as an httpOnly cookie, the response body provides the user object (name, email, role) for client-side routing decisions (e.g., redirecting faculty vs. students to different pages). The accessToken in the body is a convenience — the cookie is the authoritative auth mechanism. This is consistent with `POST /api/auth/login` and `POST /api/auth/refresh` which also return tokens in the body.

### 4.2 Existing Password User Attempts Google

```
POST /api/auth/google
  → googleId not set → email exists as STUDENT
  → Return { action: "link_prompt" }
  → Client shows: "Link Google to your existing account for faster sign-in?"
  → User confirms → POST /api/auth/google/link { credential }
  → Set googleId, generate tokens, set cookies, login
```

This replaces the previous "already registered, use password" rejection. Linking is safe because the OAuth flow cryptographically proves the user owns the email.

### 4.3 Google-Only User Attempts Password Login

```
POST /api/auth/login { identifier, password }
  → user found → user.googleId exists → user.password is null
  → Return 400 { code: "GOOGLE_ACCOUNT_ONLY", message: "..." }
```

**Error code:** `GOOGLE_ACCOUNT_ONLY` — returned by the existing `/api/auth/login` route when a Google-only user attempts email/password login. The frontend should display a prompt to use Google Sign-In instead.

---

## 5. Authentication Invariants

These invariants are always true. Code should not violate them.

| Provider Combination | password | googleId | Can authenticate via |
|---|---|---|---|
| LOCAL only | user-chosen hash | null | email + password |
| GOOGLE only | random hash (never used) | set | Google Sign-In |
| LOCAL + GOOGLE | user-chosen hash | set | email + password OR Google Sign-In |

**Rules that follow from these invariants:**

1. `password` is always a non-null bcrypt hash — always a valid `String`
2. If `googleId` is set, user can authenticate via Google
3. If `googleId` is null, user is local-only — authenticate via email + password
4. Google-only users have a random `password` hash (generated at registration, never exposed)
5. `googleId` cannot be unset if the user has no other authentication factor (Phase 2 concern — no unlink in Phase 1)
6. The presence of `googleId` does NOT imply `password` is user-chosen — use `bcrypt.compare(credentials, user.password)` to distinguish Google-only from dual-provider

---

## 6. Faculty Flow

### 6.1 Core Rule

**Google Sign-In never creates faculty accounts.** Faculty accounts are created exclusively via the existing email/password registration + admin approval workflow.

### 6.2 Existing Approved Faculty

```
POST /api/auth/google
  → email matches FACULTY record, status = ACTIVE
  → googleId not set → Return { action: "link_prompt", role: "faculty" }
  → User confirms → POST /api/auth/google/link → Login
  → googleId already set → Return { action: "login" }
```

Account Settings linking (Method 2) is deferred to Phase 2.

### 6.3 Pending Faculty

```
POST /api/auth/google
  → email matches FACULTY record, status = PENDING
  → Return { action: "pending", message: "Your faculty account is awaiting administrator approval." }
  → No JWT issued, no link established
```

### 6.4 Rejected Faculty

```
POST /api/auth/google
  → email matches FACULTY record, status = REJECTED
  → Return { action: "rejected", message: "Your faculty registration was rejected." }
  → No JWT issued, no link established
```

### 6.5 Admin Accounts

Google cannot create admin accounts through any path:
- New Google registration: hardcodes `role: 'STUDENT'`
- Account linking: preserves existing role (never creates new admin)
- No OAuth flow can create or elevate to ADMIN

---

## 7. API Routes — Complete Specification

### 7.1 POST /api/auth/google — OAuth Entry Point

**Validation:** `googleAuthSchema` — `{ credential: string }`

**Google claim verification (in order):**
1. `verifyIdToken(credential, audience: GOOGLE_CLIENT_ID)`
2. Verify `aud` matches `GOOGLE_CLIENT_ID` (library does this)
3. Verify `iss` is `accounts.google.com` or `https://accounts.google.com` (library does this)
4. Verify `exp` is in the future (library does this)
5. Verify `email_verified === true` — Google confirms user owns the email
6. Verify `email.endsWith('@' + ALLOWED_EMAIL_DOMAIN)` — institutional domain

**DB lookup:**
1. Look up by `googleId` (sub claim)
2. If not found, look up by `email`
3. If neither found → registration flow (generate `pending_reg`, return `action: "register"`)

**Response error codes (stable — frontend switches on code, not message):**

| Code | HTTP Status | Meaning |
|---|---|---|
| `GOOGLE_TOKEN_INVALID` | 401 | Credential is not a valid Google ID token |
| `GOOGLE_TOKEN_EXPIRED` | 401 | Google ID token has expired |
| `GOOGLE_DOMAIN_INVALID` | 403 | Email domain does not match allowed domain |
| `GOOGLE_ACCOUNT_PENDING` | 403 | Faculty account exists but is PENDING approval |
| `GOOGLE_ACCOUNT_REJECTED` | 403 | Faculty account was REJECTED |
| `GOOGLE_FEATURE_DISABLED` | 404 | GOOGLE_SIGNIN_ENABLED is false |

**Response body:**
```json
{
  "success": true,
  "action": "login" | "register" | "link_prompt" | "pending" | "rejected" | "invalid_domain",
  "error": { "code": "GOOGLE_ACCOUNT_PENDING", "message": "..." } | null,
  "data": {
    "accessToken": "...",       // only on "login" action
    "user": { ... },            // only on "login" action
    "email": "...",             // always present
    "name": "..."               // always present
  } | null
}
```

### 7.2 POST /api/auth/register/google — Complete Registration

**Validation:** Reads `pending_reg` cookie + validates `googleRegistrationSchema` (`{ name, uid, phone }`)

**Steps:**
1. Read and verify `pending_reg` cookie (signature via `GOOGLE_REGISTRATION_SECRET`, expiry)
2. Extract `{ sub, email, name }` from JWT
3. Re-verify domain (email domain must match `ALLOWED_EMAIL_DOMAIN`)
4. Validate form: name ≥ 2 chars, uid matches TCET format, phone ≥ 10 digits
5. Generate random password: `crypto.randomBytes(32).toString('hex')` → `bcrypt.hash(randomPw, 12)`
6. Prisma transaction (atomic):
   - Check email NOT in DB → if taken, error `EMAIL_EXISTS` (409)
   - Check uid NOT in DB → if taken, error `UID_EXISTS` (409)
   - Check googleId NOT in DB → if taken, error `GOOGLE_ALREADY_LINKED` (409)
   - Create user with `password: hashedRandomPw`
   - Commit
7. Clear `pending_reg` cookie (maxAge: 0)
8. `logActivity('GOOGLE_REGISTRATION_COMPLETED', { email, userId: user.id })`
9. Generate 3 JWT tokens (existing jwt.ts functions)
10. Set 3 cookies (existing cookie options)
11. `syncDashboardUser(user)` — fire and forget, outside transaction, never blocks login
12. Return success

**Error codes:**

| Code | HTTP Status | Meaning |
|---|---|---|
| `GOOGLE_REGISTRATION_EXPIRED` | 401 | `pending_reg` cookie has expired (>15 min) |
| `GOOGLE_REGISTRATION_INVALID` | 401 | `pending_reg` cookie signature is invalid |
| `GOOGLE_REGISTRATION_MISSING` | 401 | No `pending_reg` cookie present |
| `EMAIL_EXISTS` | 409 | Email was taken during the registration window |
| `UID_EXISTS` | 409 | UID is already registered |
| `GOOGLE_ALREADY_LINKED` | 409 | Google account was linked during the registration window |

### 7.3 POST /api/auth/google/link — Link Google to Existing Account

**Purpose:** Confirm linking for existing STUDENT, FACULTY, or ADMIN accounts.

**Validation:** `googleAuthSchema` — `{ credential: string }`

**Steps:**
1. Verify Google ID token
2. Extract `{ sub, email }`
3. Find user by email — must exist
4. Check: user must NOT already have `googleId === sub` (idempotent — return success if already linked)
5. Check: user must NOT have `googleId` set to a different value
6. Update user: set `googleId = sub`
7. Generate 3 JWT tokens
8. Set 3 cookies
9. Return success

**Error codes:**

| Code | HTTP Status | Meaning |
|---|---|---|
| `GOOGLE_TOKEN_INVALID` | 401 | Invalid Google credential |
| `GOOGLE_ALREADY_LINKED` | 409 | Google account already linked to a different user |

### 7.4 POST /api/auth/password/set — Set Password (Phase 2)

**Postponed.** Not in Phase 1.

Rationale: The initial release focuses on auth flows, not account management. Google-only users without a password fallback is an accepted risk for Phase 1.

---

## 8. Google Claim Trust Model

| Claim | Trust Level | Used For | Authority |
|---|---|---|---|
| `sub` | **Full** | User identity lookup (`googleId`) | Google's immutable user ID. Cryptographically verified. Cannot be forged or modified. |
| `email` | **Full** | Account email, domain validation | From verified ID token. Google confirms email ownership. |
| `email_verified` | **Full** | Skip OTP requirement | Google has verified the user owns this email. |
| `hd` | **Signal only** | Additional domain hint | Present only for Google Workspace accounts. NOT authoritative — the email domain check is sufficient. |
| `name` | **Profile only** | Prefill registration form | Prefilled, user-editable, never overwritten after registration. NOT trusted for authorization. |
| `picture` | **Ignored** | — | Out of scope. App does not display avatars. |
| `locale` | **Ignored** | — | Not relevant to authentication or authorization. |

**Policy:** Only `sub`, `email`, and `email_verified` affect authentication. Everything else is profile data.

---

## 9. Profile Ownership Rules

| Field | Source | Editable During Registration? | Overwritten by Future Login? |
|---|---|---|---|
| Email | Google ID token | **No** (read-only, displayed) | **No** (not on future login; email changes are a separate feature) |
| Name | Prefilled from Google | **Yes** | **No** — never overwritten. User's DB name is the source of truth after registration. |
| Phone | User input | **Yes** | N/A — Google doesn't provide this |
| UID | User input | **Yes** | N/A — Google doesn't provide this |

---

## 10. Rate Limiting

| Endpoint | Limit | Justification |
|---|---|---|
| `POST /api/auth/google` | 30 req/min/IP | Token verification is cheap. 30/min handles classroom bursts (60 students can login in ~2 minutes). |
| `POST /api/auth/register/google` | 10 req/min/IP | Registration includes a DB transaction. Lower limit prevents resource exhaustion. |
| `POST /api/auth/google/link` | 10 req/min/IP | Account linking is a sensitive one-time operation. |
| `POST /api/auth/password/set` | 5 req/min/IP | Authentication credential change. Not deployed in Phase 1. |

Implementation: in-memory counter with TTL (same pattern as existing OTP rate limiting). Per-IP tracking.

---

## 11. Logout Behavior

Logout clears 3 cookies (identical to existing behavior):
- `accessToken` → `maxAge: 0`
- `refreshToken` → `maxAge: 0`
- `coe_shared_token` → `maxAge: 0`

**Does NOT revoke the Google OAuth session.** Google's session is independent and managed by the user at `accounts.google.com`. The app does not store Google credentials server-side, so server-side revocation is not possible.

---

## 12. Audit Logging

Structured audit events (separate from analytics). Logged server-side with user email, timestamp, and result.

| Event | Trigger | Log Level | Payload |
|---|---|---|---|
| `GOOGLE_LOGIN` | Returning Google user logged in | INFO | `{ email, googleId: sub }` |
| `GOOGLE_LOGIN_FAILED` | Google token verification failed | WARN | `{ email?, error: code }` |
| `GOOGLE_REGISTRATION_STARTED` | `pending_reg` JWT created | INFO | `{ email, googleId: sub }` |
| `GOOGLE_REGISTRATION_COMPLETED` | User created via Google registration | INFO | `{ email, userId }` |
| `GOOGLE_ACCOUNT_LINKED` | Google linked to existing account | INFO | `{ email, userId, previousAuthMethod }` |
| `GOOGLE_ACCOUNT_LINK_FAILED` | Link attempt failed | WARN | `{ email, error: code }` |
| `GOOGLE_PENDING_DENIED` | Pending faculty blocked | WARN | `{ email }` |
| `GOOGLE_REJECTED_DENIED` | Rejected faculty blocked | WARN | `{ email }` |

**Implementation: Use the existing `logActivity` utility at `src/lib/activity-log.ts`.**

```typescript
import { logActivity } from '@/lib/activity-log';

// On successful Google login:
logActivity('GOOGLE_LOGIN', { email, googleId: sub });

// On failed verification:
logActivity('GOOGLE_LOGIN_FAILED', { email, error: code });
```

The existing utility formats events as structured JSON with timestamps:
```json
{"ts":"2026-07-01T12:00:00.000Z","event":"GOOGLE_LOGIN","email":"user@tcetmumbai.in","googleId":"12345"}
```

This is separate from analytics. The events above are operational audit events for incident response and troubleshooting. They are NOT sent to Google Analytics or any product analytics service.

Dashboard sync failures (which are fire-and-forget and must never block login) should also be logged via this utility with event name `DASHBOARD_SYNC_FAILED` and the error context, rather than disappearing into `console.error`.

---

## 13. Feature Flag (`GOOGLE_SIGNIN_ENABLED`)

**Default:** `false`

**When false:**
- Login page: "Continue with Google" button is **not rendered**
- Frontend: Google OAuth provider is **not initialized**
- `POST /api/auth/google`: Returns `{ code: "GOOGLE_FEATURE_DISABLED" }` with HTTP 404
- `POST /api/auth/register/google`: Returns `{ code: "GOOGLE_FEATURE_DISABLED" }` with HTTP 404
- `POST /api/auth/google/link`: Returns `{ code: "GOOGLE_FEATURE_DISABLED" }` with HTTP 404
- All Google code paths are **completely inert**

**When true:** Everything works as specified.

**Rollout:**
1. Deploy schema migration (add googleId, nullable password)
2. Deploy all code with `GOOGLE_SIGNIN_ENABLED=false` — feature is invisible
3. Internal testing: enable on staging
4. Canary: enable for internal team
5. Production: set `GOOGLE_SIGNIN_ENABLED=true`, monitor

**Rollback:** Set `GOOGLE_SIGNIN_ENABLED=false`, restart. `POST /api/auth/google` returns 404, the Google button is hidden, and the frontend provider is not initialized. New Google sign-ups are blocked.

**Existing user impact during rollback:**
- Users with LOCAL + GOOGLE (password exists) → can still log in via email/password. Unaffected.
- Users with GOOGLE only (no password) → **cannot authenticate** until the feature is re-enabled or they acquire a password through `POST /api/auth/password/set` (Phase 2). This is the accepted risk of deferring password-set to Phase 2.
- Users with an active session → continue using the app until their JWT cookies expire, after which they fall into one of the two categories above.

---

## 14. OAuth Library Decision (Documentation for Maintainers)

```typescript
/**
 * WHY google-auth-library INSTEAD OF A FULL AUTH FRAMEWORK:
 *
 * This project has a working custom auth system:
 * - JWT token generation and verification (src/lib/jwt.ts)
 * - httpOnly cookie management (accessToken, refreshToken, coe_shared_token)
 * - Refresh token rotation (POST /api/auth/refresh)
 * - Role-based authorization (src/lib/api-helpers.ts → authorize())
 * - Cross-subdomain SSO (coe_shared_token via shared-auth.ts)
 * - Admin approval workflow for faculty accounts
 * - Rate-limited OTP verification
 * - Dashboard synchronization (syncDashboardUser)
 *
 * Adding Google Sign-In requires ONE thing: verify a Google ID token
 * server-side and establish that the user's Google identity maps to a
 * user record in our database. Once that mapping exists, the existing
 * JWT + cookie + RBAC system handles everything else.
 *
 * NextAuth.js would:
 * - Replace the entire auth architecture (9 API routes, 5 utility files)
 * - Require migrating all existing session handling
 * - Introduce framework lock-in (hard to customize auth behavior)
 * - Add ~50KB of framework code for a feature that needs ~5KB
 *
 * Passport.js would:
 * - Add middleware that conflicts with Next.js App Router route handlers
 * - Require serialization/deserialization of user objects
 * - Add session management that duplicates our existing JWT system
 *
 * google-auth-library:
 * - Does exactly one thing: verify a Google ID token
 * - Returns the verified payload (sub, email, name, etc.)
 * - Handles Google's certificate caching and rotation automatically
 * - Has zero framework dependencies
 * - Integrates as a single function call in our existing route handlers
 *
 * Principle of least power: use the simplest tool that meets the requirement.
 */
```

---

## 15. User Account Linking — Two Methods

### Method 1: Login-Time Linking (Phase 1)

User clicks "Continue with Google" → existing account detected → prompt → confirm → linked + logged in.

This is the primary linking flow and covers the 95% use case.

### Method 2: Settings Page Linking (Phase 2)

User is already logged in → navigates to Settings → Account → "Link Google Account" → OAuth flow → linked.

This is the secondary flow for users who want to link Google after already being logged in.

**Phase 1 ships Method 1 only.**

---

## 16. Phase 1 Scope (Implementation Order)

### Phase 1 — Must Ship

| Step | Files | Prerequisites |
|---|---|---|
| 1. Schema migration | `prisma/schema.prisma` | None |
| 2. Dependencies + env vars | `package.json`, `.env.example`, `.env.docker.example` | None |
| 3. Google auth utility | `src/lib/google-auth.ts` | None |
| 4. `POST /api/auth/google` | `src/app/api/auth/google/route.ts` | 1, 2, 3 |
| 5. `POST /api/auth/register/google` | `src/app/api/auth/register/google/route.ts` | 1, 2, 3 |
| 6. `POST /api/auth/google/link` | `src/app/api/auth/google/link/route.ts` | 1, 2, 3 |
| 7. Login route guard | `src/app/api/auth/login/route.ts` (+4 lines) | 1 |
| 8. Forgot/reset password UX | `src/app/api/auth/forgot-password/route.ts`, `reset-password/route.ts` | None (password is always present — flow works unchanged. Google users can acquire a password via this flow.) |
| 9. `/register/complete` page | `src/app/register/complete/page.tsx` | 4, 5 |
| 10. Google button on login page | `src/app/login/page.tsx` | 4, 9 |
| 11. Validator schemas | `src/lib/validators.ts` | Before 4, 5, 6 |

### Postponed to Phase 2

| Feature | Reason |
|---|---|
| `POST /api/auth/password/set` | Account management, not auth flow. Users without password fallback is an accepted risk. |
| `POST /api/auth/google/unlink` | Users can't break their account by linking. Unlinking is a lower priority. |
| Settings page linking (Method 2) | 95% of linking happens at login time. Settings page is nice-to-have. |
| Avatar/picture support | App doesn't display avatars. Add separately if UX requires it. |
| Email change | Not related to Google Sign-In. Separate feature. |

---

## 17. Double Submission Protection

### Client-Side
- Submit button disabled on first click
- Loading state shown during submission
- Prevent duplicate `POST` requests

### Server-Side
- Prisma transaction ensures atomicity — either all checks pass and user is created, or nothing happens
- `@unique` constraints on `email`, `uid`, `googleId` prevent duplicate user creation even if two concurrent requests pass the transaction's read checks
- Idempotent error handling: if user already exists, return the existing user rather than creating a duplicate (applies to linking, not registration)

---

## 18. Security Audit — Final Risk Register

### High (0 risks)

All high risks from the iterative review have been mitigated or accepted:

| Previous Risk | Mitigation | Residual |
|---|---|---|
| Registration session replay | Short TTL (15 min) + unique constraints (email, uid, googleId) + cookie clearing on success. In-memory jti tracking removed per architecture decision. | Very Low — attacker would need to intercept httpOnly cookie AND know valid uid/phone AND submit before legitimate user AND beat unique constraints |
| Google token replay | google-auth-library verifies exp, aud, iss | Very Low — tokens expire within 1 hour |
| Domain bypass | All domain validation is server-side on verified token payload | None — frontend cannot bypass |

### Medium (2 risks)

| Risk | Mitigation | Residual |
|---|---|---|
| Faculty PENDING/REJECTED status ignored due to code bug | Add explicit status check in google route handler. Test with PENDING and REJECTED fixtures. | Low — one conditional, easy to verify |
| googleId unique constraint violation causes confusing error | Catch Prisma unique constraint error, map to `GOOGLE_ALREADY_LINKED` code | Low — handled error |

### Low (4 risks)

| Risk | Mitigation | Residual |
|---|---|---|
| CSR vulnerability (Google button renders on same page as existing forms) | SameSite=Lax cookies, no state-changing GET requests | None — existing risk, unchanged |
| XSS via name field | React auto-escapes, Zod validates, server-side sanitization | None — existing mitigation |
| Open redirect via callbackUrl | Existing `getSafeNextPath()` and `isValidCallbackUrl()` | None — existing mitigation |
| Dashboard sync abuse | `x-sync-secret` header, same as existing system | None — unchanged |

### Accepted Risks (0)

All risks are mitigated to Very Low or None. No risks accepted without mitigation.

---

## 19. Simplicity Review

**"Is there anything in this plan that solves a hypothetical future problem rather than a real requirement today?"**

| Item | Verdict | Reason |
|---|---|---|
| Dedicated `GOOGLE_REGISTRATION_SECRET` | **Required** (not hypothetical) | Registration tokens are pre-auth; access tokens are post-auth. Different security boundary. Clear separation of concerns. |
| Generic cookie name `pending_reg` | **Required** (not hypothetical) | Renaming a cookie later is a breaking change. Naming it generically today costs nothing and avoids future rename. |
| Auth invariants documentation | **Required** (not hypothetical) | Documents what is always true, preventing future bugs from developers who assume `password` is always present. |
| Audit logging (8 event types) | **Required for production** | Without audit logs, incident response is blind. These are minimal operational events, not analytics. |
| Phase 2 backlog | **Explicitly postponed** | Set password, unlink, settings linking, avatar, email change — all deferred. Not built today. |

**Verdict:** No hypothetical abstractions remain. Every item in this spec addresses a concrete requirement or documents a design decision that prevents a concrete bug.

---

## 20. Files Summary (Final)

### New Files (5)

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/google-auth.ts` | ~60 | Google ID token verification + claim extraction |
| `src/app/api/auth/google/route.ts` | ~140 | Single OAuth entry point (all 6 response actions) |
| `src/app/api/auth/register/google/route.ts` | ~100 | Complete Google registration with Prisma transaction |
| `src/app/api/auth/google/link/route.ts` | ~70 | Google account linking with idempotency |
| `src/app/register/complete/page.tsx` | ~180 | Registration completion form with failure resilience |

### Modified Files (7)

| File | Change |
|---|---|
| `prisma/schema.prisma` | +2 lines (`googleId String? @unique`, `@@index([googleId])`). Password field unchanged (`String`, still required — random hash for Google users). |
| `src/app/login/page.tsx` | Add "Continue with Google" button + action response handler (switch on action code) |
| `src/app/api/auth/login/route.ts` | +4 lines guard (`if (!isMatch && user.googleId)` → suggest Google Sign-In) |
| `src/app/api/auth/forgot-password/route.ts` | No structural change (password always present, enumeration prevention already exists) |
| `src/app/api/auth/reset-password/route.ts` | No structural change (password always present, flow works for all user types) |
| `src/lib/validators.ts` | +12 lines (googleAuthSchema, googleRegistrationSchema) |
| `.env.example`, `.env.docker.example` | +5 lines (GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_CLIENT_ID, GOOGLE_REGISTRATION_SECRET, GOOGLE_SIGNIN_ENABLED, ALLOWED_EMAIL_DOMAIN) |

### Environment Variables (5)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | — | OAuth 2.0 Web Client ID. Used server-side by `google-auth-library` to verify the ID token's `aud` claim. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | — | Public client ID for frontend `@react-oauth/google` provider. |
| `GOOGLE_REGISTRATION_SECRET` | Yes | — | Secret for signing the `pending_reg` JWT. Independent from `JWT_ACCESS_SECRET` — registration tokens are pre-auth (different security boundary). |
| `GOOGLE_SIGNIN_ENABLED` | No | `false` | Feature flag. When false, the entire Google feature is inert. |
| `ALLOWED_EMAIL_DOMAIN` | No | `tcetmumbai.in` | Restrict Google sign-ups to institutional email domain. Server-side enforcement on verified token payload. |

**`GOOGLE_CLIENT_SECRET` is not listed because it is not used.** Our OAuth flow uses the popup-based Google Identity Services (GIS) flow — the frontend receives a credential (ID token) and sends it to the backend for verification via `google-auth-library`. The client secret is only required for server-side authorization code exchange (redirect-based flow) or when making Google API calls on behalf of the user. Neither applies to this implementation.

### Dependencies (2)

| Package | Type | Purpose |
|---|---|---|
| `google-auth-library` | dependency | Server-side Google ID token verification |
| `@react-oauth/google` | dependency | Frontend Google Sign-In button |

---

## 21. Testing Matrix (Phase 1)

### Registration (6 tests)

| # | Test | Expected |
|---|---|---|
| 1 | New Google user completes full flow | User created, tokens issued, redirected |
| 2 | Non-institutional email | `GOOGLE_DOMAIN_INVALID` |
| 3 | Expired `pending_reg` | `GOOGLE_REGISTRATION_EXPIRED`, redirect to login |
| 4 | Duplicate UID on submit | `UID_EXISTS`, `pending_reg` preserved, user retries |
| 5 | Duplicate email race (taken between Google verify and form submit) | `EMAIL_EXISTS`, user redirected to login |
| 6 | Direct access to `/register/complete` without cookie | `GOOGLE_REGISTRATION_MISSING`, redirect to login |

### Login (4 tests)

| # | Test | Expected |
|---|---|---|
| 7 | Returning Google user (googleId exists) | Normal login, tokens issued |
| 8 | Google-only user tries email+password | `GOOGLE_ACCOUNT_ONLY`, 400 |
| 9 | Existing STUDENT links Google via prompt | Linked, logged in |
| 10 | Existing ACTIVE FACULTY links Google via prompt | Linked, logged in |

### Faculty (3 tests)

| # | Test | Expected |
|---|---|---|
| 11 | PENDING faculty clicks Google | `GOOGLE_ACCOUNT_PENDING`, no JWT |
| 12 | REJECTED faculty clicks Google | `GOOGLE_ACCOUNT_REJECTED`, no JWT |
| 13 | FACULTY with no googleId clicks Google (ACTIVE) | `link_prompt`, linking succeeds on confirmation |

### Feature Flag (3 tests)

| # | Test | Expected |
|---|---|---|
| 14 | All Google API routes when `GOOGLE_SIGNIN_ENABLED=false` | `GOOGLE_FEATURE_DISABLED`, 404 |
| 15 | Google button when `GOOGLE_SIGNIN_ENABLED=false` | Not rendered |
| 16 | Google button when `GOOGLE_SIGNIN_ENABLED=true` | Rendered |

### Security (3 tests)

| # | Test | Expected |
|---|---|---|
| 17 | Replayed Google ID token | `GOOGLE_TOKEN_INVALID` (exp/aud check) |
| 18 | Rate limit exceeded (31st request in 1 min to google route) | 429 |
| 19 | Tampered `pending_reg` cookie | `GOOGLE_REGISTRATION_INVALID` |

### Regression (4 tests)

| # | Test | Expected |
|---|---|---|
| 20 | Email/password login | Unchanged |
| 21 | Student email registration + OTP | Unchanged |
| 22 | Faculty email registration + approval | Unchanged |
| 23 | Token refresh + dashboard SSO | Unchanged |

---

## 22. Key Design Decisions — Summary

| Decision | Chosen | Rationale |
|---|---|---|
| Auth model | `googleId` on User (not identity table) | 2 providers don't justify abstraction |
| Registration secret | Dedicated `GOOGLE_REGISTRATION_SECRET` | Different security boundary than auth tokens |
| Replay protection | Short TTL + unique constraints + cookie clearing | In-memory tracking rejected (multi-instance/serverless) |
| Student linking | Link + Login (not rejection) | Same security as password reset, better UX |
| Faculty registration | Google cannot register faculty | Preserve approval workflow |
| Admin creation | No OAuth path can create admin | Verified — all 4 paths blocked |
| Avatar support | Removed from Phase 1 | App does not display avatars |
| Set password | Postponed to Phase 2 | User accepted risk of no recovery path. Google users can acquire a password via the existing Forgot Password flow (OTP → set new password) — the random hash is replaced with user's chosen password, converting them to dual-provider. |
| OAuth library | `google-auth-library` | Does exactly one thing needed |
| Error contract | Stable codes (not messages) | Frontend switches on codes, not strings |
| Transaction boundary | Reads + create only | JWT + cookies + sync outside transaction |
| Registration failure | `pending_reg` preserved on validation errors | User doesn't re-authenticate with Google on typos |

---

## 23. Implementation Can Begin

This specification is complete. Every decision is documented and justified. No hypothetical abstractions remain. The existing JWT, cookie, RBAC, middleware, session, and dashboard architecture is fully preserved.

The implementation surface is:
- **5 new files** (~550 lines total)
- **7 modified files** (~20 lines of changes — 4 lines in login route guard, 12 lines in validators.ts, 2 lines in schema.prisma, minor adjustments to env files)
- **2 new dependencies** (google-auth-library, @react-oauth/google)
- **5 environment variables** (3 required: `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_REGISTRATION_SECRET`; 2 optional: `GOOGLE_SIGNIN_ENABLED`, `ALLOWED_EMAIL_DOMAIN`)
- **0 schema migrations** for the password field (unchanged — random hash approach)
- **1 schema migration** for the googleId field (additive, backward-compatible)
- **0 changes** to the existing auth infrastructure (jwt.ts, api-helpers.ts, shared-auth.ts, callback-url.ts, dashboard-sync.ts, middleware, protected routes)

`GOOGLE_CLIENT_SECRET` is excluded because the popup-based GIS + ID token verification flow does not require it.
