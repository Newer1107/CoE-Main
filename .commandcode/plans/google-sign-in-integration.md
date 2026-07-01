# Google Sign-In Integration: Architecture Review & Implementation Plan

## Architecture Overview

### Current Authentication System

The application uses a **custom JWT-based authentication system** with the following components:

| Component | Technology | Details |
|---|---|---|
| Password hashing | `bcryptjs` | 12 salt rounds |
| JWT signing | `jsonwebtoken` (HS256) | 3 token types |
| Database ORM | Prisma 5 | PostgreSQL/MySQL |
| Cookies | httpOnly, SameSite=Lax | 3 cookies on login |
| Email | nodemailer | OTP delivery |
| Validation | Zod 4 | Server-side schemas |

### Token Architecture

| Token | Secret Env | Default TTL | Purpose |
|---|---|---|---|
| `accessToken` | `JWT_ACCESS_SECRET` | 8 hours | Auth for CoE Main |
| `refreshToken` | `JWT_REFRESH_SECRET` | 7 days | Token rotation |
| `coe_shared_token` | `JWT_ACCESS_SECRET` | 7 days | Cross-subdomain SSO for Dashboard |

### Cookie Strategy

All cookies are set via `response.cookies.set()` in API routes:

| Cookie Name | httpOnly | Secure | SameSite | Path | Domain | TTL |
|---|---|---|---|---|---|---|
| `accessToken` | Yes | `COOKIE_SECURE === 'true'` | `lax` | `/` | (none) | 8h |
| `refreshToken` | Yes | `COOKIE_SECURE === 'true'` | `lax` | `/` | (none) | 7d |
| `coe_shared_token` | Yes | `NODE_ENV === 'production'` | `lax` | `/` | `.tcetcercd.in` | 7d |

### Auth API Routes (9 endpoints)

| Route | Method | Purpose | Key Logic |
|---|---|---|---|
| `/api/auth/login` | POST | Authenticate with email/UID + password | bcrypt compare, 3 token generation, 3 cookie set |
| `/api/auth/logout` | POST | API logout | Clear 3 cookies (maxAge: 0) |
| `/api/auth/logout` | GET | Redirect logout | Clear cookies + redirect to callback URL |
| `/api/auth/refresh` | POST | Rotate access token | Verify refreshToken cookie, re-issue accessToken + sharedToken |
| `/api/auth/register/student` | POST | Register new student | Create user (isVerified: false), send OTP |
| `/api/auth/register/faculty` | POST | Register new faculty | Create user (isVerified: true, status: PENDING), notify admin |
| `/api/auth/verify-otp` | POST | Verify email via OTP | Validate 6-digit OTP (10-min TTL), set isVerified: true |
| `/api/auth/resend-otp` | POST | Resend OTP | Rate-limited: max 3 OTPs per 15 min |
| `/api/auth/forgot-password` | POST | Request reset OTP | Account enumeration prevention |
| `/api/auth/reset-password` | POST | Reset password | Validate OTP, bcrypt hash new password |

### Backend Auth Utilities

| File | Key Exports |
|---|---|
| `src/lib/jwt.ts` | `generateAccessToken`, `generateRefreshToken`, `generateSharedToken`, `verifyAccessToken`, `verifyRefreshToken`, `TokenPayload`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` |
| `src/lib/api-helpers.ts` | `authenticate(req)`, `authorize(user, ...roles)`, `useSecureCookies()`, `successRes()`, `errorRes()` |
| `src/lib/shared-auth.ts` | `getSharedCookieOptions()`, `buildSharedTokenPayload(user)`, `SHARED_COOKIE_NAME` |
| `src/lib/callback-url.ts` | `isValidCallbackUrl(url)`, `DEFAULT_CALLBACK_URL` |
| `src/lib/dashboard-sync.ts` | `syncDashboardUser(payload)` — fire-and-forget POST to Dashboard |

### Database Models (Auth-relevant)

| Model | Key Fields | Notes |
|---|---|---|
| `User` | `id` (Int, PK), `email` (String, @unique), `password` (String), `role` (Role enum), `status` (UserStatus enum), `isVerified` (Boolean), `uid` (String?), `name`, `phone`, `industryId` (Int?) | No Google ID field exists |
| `Otp` | `id` (Int, PK), `email` (String), `code` (String), `createdAt` (DateTime) | Stateless — no FK to User |
| `Role` enum | `ADMIN`, `FACULTY`, `STUDENT`, `INDUSTRY_PARTNER` | |
| `UserStatus` enum | `ACTIVE`, `PENDING`, `REJECTED` | |

### Frontend Auth

| File | Purpose |
|---|---|
| `src/app/login/page.tsx` | Login + Register + OTP modal — all in one client component |
| `src/app/layout.tsx` | Server component — reads accessToken cookie, verifies JWT, passes user to Navbar |
| `src/components/Navbar.tsx` | Client component — receives `user` prop, shows Login button or account dropdown |

### Middleware

**No middleware exists in `src/` (main CoE app).** The project-dashboard has its own middleware at `project-dashboard/src/middleware.ts` that verifies the `coe_shared_token` cookie for cross-subdomain auth.

### Protected Routes

Protected routes in the main CoE app are handled by each individual API route calling `authenticate(req)` and `authorize(user, ...roles)` from `src/lib/api-helpers.ts`. There are no route-level guards on the frontend pages — the login page checks the `next` query parameter with a strict safety validator (`getSafeNextPath()`).

---

## Assessment: Architecture Compatibility

**The current architecture is fully compatible with Google Sign-In integration.** No replacement of the existing auth system is necessary. The integration will:

1. **Reuse existing JWT system** — After Google token verification, generate the same 3 JWT tokens
2. **Reuse existing cookie system** — Set the same 3 httpOnly cookies
3. **Reuse existing RBAC** — Google Sign-In assigns the same roles
4. **Reuse existing session handling** — Refresh, logout, session expiry all work identically
5. **Reuse existing middleware** — Project dashboard reads `coe_shared_token` unchanged
6. **Reuse existing Dashboard sync** — `syncDashboardUser()` fires after first-time Google login

---

## Database Schema Changes

### Option A: Add `googleId` to User model (Recommended — simpler)

```
model User {
  // ... existing fields ...
  googleId      String?  @unique   // NEW: Google OAuth subject identifier
  @@index([googleId])               // NEW: for fast lookup
}
```

**Pros:** Minimal schema change, single query to find user by Google ID.
**Cons:** Cannot support multiple Google accounts per user (not needed for this use case).

### Option B: New `GoogleAccount` model (More flexible)

```
model GoogleAccount {
  id        Int      @id @default(autoincrement())
  googleId  String   @unique
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  email     String   // The Google account email at time of linking
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

**Pros:** Supports multiple Google identities per user, cleaner separation.
**Cons:** Extra table, extra JOIN for auth lookups.

---

## Migration Strategy

1. Create migration adding `googleId` (nullable, unique) to `users` table
2. This is a backward-compatible additive change — no existing data is affected
3. Rollback: `prisma migrate down` or delete the migration and regenerate
4. Feature flag (recommended): `GOOGLE_SIGNIN_ENABLED` env var — if not set, Google Sign-In button is hidden

---

## New API Routes

### 1. `POST /api/auth/google` — Google Sign-In Callback

**Purpose:** Verify Google ID token, create/link user, issue JWT tokens.

**Flow:**
1. Receive `{ credential: string }` (Google ID token from client)
2. Verify ID token using `google-auth-library` (server-side, not client-side)
3. Extract `{ sub, email, name, picture, email_verified }` from verified token
4. Look up user by `googleId`:
   - **Found, active →** Generate tokens, set cookies, return success
   - **Found, suspended →** Return 403 "Account suspended"
   - **Found, deleted →** Return 401 "Account not found"
   - **Not found →** Check if email exists in DB:
     - **Email exists →** Return 409 "Email already registered. Link accounts?"
     - **Email not found →** Create new user with `googleId`, `role: STUDENT`, `isVerified: true` (since Google verified the email), `status: ACTIVE`
5. Call `syncDashboardUser()` for new users
6. Return same response shape as login endpoint

### 2. `POST /api/auth/google/link` — Link Google Account to Existing User

**Purpose:** Handle the conflict when a user already has an email/password account and wants to link Google.

**Flow:**
1. Requires authentication (existing session cookie)
2. Receive `{ credential: string }`
3. Verify Google ID token
4. Check that the Google account's email matches the authenticated user's email
5. Set `googleId` on the existing user record
6. Return success

### 3. `POST /api/auth/google/unlink` — Unlink Google Account

**Purpose:** Allow users to remove Google Sign-In from their account.

**Flow:**
1. Requires authentication
2. Check that user has a password set (can't unlink Google if no password — they'd be locked out)
3. Set `googleId` to null
4. Return success

---

## Frontend Changes

### `src/app/login/page.tsx`

1. Add Google Sign-In button below the login form
2. Use Google's `@react-oauth/google` library or the vanilla GIS library (Google Identity Services)
3. On successful credential response:
   - POST credential to `/api/auth/google`
   - On success → `window.location.assign(destination)` (same pattern as email login)
   - On 409 (email exists) → Show "Link account?" modal
   - On error → Show error toast (same pattern as existing error handling)

### `src/app/layout.tsx`

1. No changes needed — Google Sign-In sets the same cookies, layout reads them identically

### `src/components/Navbar.tsx`

1. No changes needed — Google Sign-In produces same user shape

### New: Google Provider Wrapper

Add a `GoogleOAuthProvider` wrapping the login page (or the root layout conditionally) to provide the Google OAuth client ID context.

---

## Environment Variables (New)

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 Web Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Public client ID for frontend (`NEXT_PUBLIC_` prefix) |
| `GOOGLE_SIGNIN_ENABLED` | No | Feature flag: set to `true` to enable Google Sign-In |

---

## Files Affected

### New Files

| File | Purpose |
|---|---|
| `src/lib/google-auth.ts` | Google ID token verification utility |
| `src/app/api/auth/google/route.ts` | Google Sign-In API endpoint |
| `src/app/api/auth/google/link/route.ts` | Account linking API endpoint |
| `src/app/api/auth/google/unlink/route.ts` | Account unlinking API endpoint |

### Existing Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `googleId` field to User model + index |
| `src/app/login/page.tsx` | Add Google Sign-In button + credential handler + link account modal |
| `src/lib/validators.ts` | Add `googleAuthSchema` for credential validation |
| `.env.example` | Add Google OAuth environment variables |
| `.env.docker.example` | Add Google OAuth environment variables |

### Files That Do NOT Change

| File | Reason |
|---|---|
| `src/lib/jwt.ts` | Same token generation reused |
| `src/lib/api-helpers.ts` | Same auth helpers used |
| `src/lib/shared-auth.ts` | Same shared token/cookie reused |
| `src/lib/callback-url.ts` | Same callback validation reused |
| `src/lib/dashboard-sync.ts` | Same sync function reused |
| `src/app/layout.tsx` | Reads cookies identically |
| `src/components/Navbar.tsx` | Receives same user shape |
| `src/app/api/auth/login/route.ts` | No changes needed |
| `src/app/api/auth/refresh/route.ts` | No changes needed |
| `src/app/api/auth/logout/route.ts` | Same cookie clearing works |
| `project-dashboard/src/middleware.ts` | Reads shared token identically |
| All other API routes | Auth helpers unchanged |
| All existing Zod validators | Only new validator added |

---

## Dependency Changes

| Package | Type | Purpose |
|---|---|---|
| `google-auth-library` | dependency | Server-side Google ID token verification |
| `@react-oauth/google` | dependency | Frontend Google Sign-In button + credential handler |

---

## Edge Cases & Decisions

### 1. Existing Local Account (email exists, no googleId)

**Decision:** Return 409 with `{ exists: true, needsLink: true, email }`. The frontend shows a "Link Google Account" modal asking the user to log in with their existing credentials first, then link Google. This prevents account takeover.

### 2. Existing Google Account (googleId exists)

**Flow:** Normal login — generate tokens, set cookies, redirect. No password needed.

### 3. Faculty Accounts

**Decision:** Faculty can use Google Sign-In, but they still go through the approval workflow (`status: PENDING`). Google accounts are created with `status: PENDING` and `isVerified: true`. Admin must approve before login succeeds. The login handler checks `status === 'PENDING'` and returns 403 (same as existing behavior).

### 4. Admin Accounts

**Decision:** Admin accounts CANNOT be created via Google Sign-In. If a Google-authenticated user's email matches `ADMIN_EMAIL`, they are still created as `STUDENT` by default. Admin role assignment remains a manual DB operation.

### 5. OTP

**Decision:** Google Sign-In users skip OTP entirely. Google has already verified the email. OTP remains for:
- Email/password registration (students)
- Password reset (all users)

### 6. Role Assignment

**Decision:** Google Sign-In always assigns `STUDENT` role. Role changes are made by admins, same as existing system.

| Role | Google Sign-In? | How Assigned |
|---|---|---|
| `STUDENT` | Yes | Default role for Google Sign-In |
| `FACULTY` | Yes | After admin approval (same workflow) |
| `ADMIN` | No | Manual DB operation only |
| `INDUSTRY_PARTNER` | No | Must go through existing registration |

### 7. Suspended Users

**Decision:** Login blocked with 403 "Account suspended." Same as existing behavior — the login handler checks user status regardless of auth method.

### 8. Deleted Users

**Decision:** Login blocked with 401 "Account not found." If the user record was deleted from DB, Google lookup returns no result. The user would need to re-register.

### 9. Duplicate Emails

**Decision:** Prevented by `email: @unique` constraint on the User model. The 409 "email exists" flow handles this.

### 10. Missing Google Email

**Decision:** If Google does not return an email (rare but possible), return 400 "Google account must have an email address." Some Google accounts (e.g., G Suite accounts configured without email scope) may not return email.

### 11. Changed Google Email

**Decision:** Users are identified by `sub` (Google's immutable user ID), not email. If the Google account email changes, the user still logs in successfully because we look up by `googleId`. The email in our DB is NOT automatically updated — the user's record retains the original email. Consider adding a periodic sync or manual "update email" flow.

### 12. Existing Sessions

All existing session infrastructure works identically:
- **Refresh tokens:** Refresh endpoint reads `refreshToken` cookie — works for Google users too
- **Logout:** Same cookie clearing logic
- **Session expiration:** Same TTL configuration
- **Multiple devices:** Google tokens issued per login — each device gets its own set of cookies

### 13. Cookie Security

| Property | Current Value | Google Impact |
|---|---|---|
| `httpOnly` | `true` | Unchanged — Google credential is exchanged server-side |
| `Secure` | `COOKIE_SECURE === 'true'` | Unchanged |
| `SameSite` | `'lax'` | Unchanged |
| `path` | `/` | Unchanged |

The Google credential is NOT stored in cookies — it's exchanged server-to-server for ID token verification, then standard JWT cookies are set.

### 14. OAuth Errors

| Error | Handling |
|---|---|
| Invalid token | Return 401 "Invalid Google credential" |
| Expired token | Return 401 "Google credential expired" — client should request new one |
| Revoked token | Return 401 "Google credential no longer valid" |
| Network failure | Frontend shows "Network error. Please try again." toast |
| Cancelled popup | Silent — user stays on login page |
| Popup blocked | Show "Please allow popups for Google Sign-In" toast |
| Malformed payload | Return 400 "Invalid credential format" |

### 15. Production Considerations

| Environment | Google OAuth Redirect URI | Notes |
|---|---|---|
| localhost | `http://localhost:3000` | Add to Google Cloud Console authorized origins |
| Staging | `https://staging.example.com` | Separate Google OAuth client |
| Production | `https://tcetcercd.in` | Production Google OAuth client |

HTTPS is required for Google Sign-In except on `localhost`. The current `NEXT_PUBLIC_APP_URL` and `FRONTEND_URL` env vars should be used for redirect URI construction.

---

## Security Review

### Vulnerabilities & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Account takeover via email mismatch** | High | The "email exists, link account" flow requires the user to authenticate with their existing password first. An attacker who knows a victim's email but not their password cannot link their own Google account. |
| **Email spoofing** | Medium | Google ID token is verified server-side using `google-auth-library`. The `email_verified` claim from Google is trusted. We do NOT trust the email from the client-side credential payload. |
| **Replay attacks** | High | Google ID tokens have a short lifetime (usually 1 hour). The `google-auth-library` verifies the `exp` claim. Tokens are single-use in the sense that each login generates new JWT cookies. |
| **JWT secret exposure** | Critical | No change — same secrets as existing system |
| **CSRF** | Low | SameSite=Lax cookies + no state-changing operations via GET |
| **Session fixation** | Low | New JWT tokens are generated on every login |
| **OTP bypass** | Low | Google Sign-In users skip OTP because Google has already verified the email. This is a deliberate design choice. |
| **Rate limiting** | Medium | Google Sign-In does not have rate limiting on the API route. Add rate limiting (e.g., 10 requests per minute per IP) to `/api/auth/google` to prevent brute-force token submission. |

### Additional Security Measures

1. **Validate `aud` claim:** Ensure the Google ID token's `aud` (audience) matches your `GOOGLE_CLIENT_ID`
2. **Validate `hd` claim (optional):** If the institution uses Google Workspace, restrict to `@tcetmumbai.in` hosted domain
3. **Rate limiting:** Add to `/api/auth/google` — reuse the same pattern as OTP rate limiting (check request count per IP in last N minutes)

---

## Implementation Plan (Ordered Steps)

### Step 1: Database Migration

```bash
npx prisma migrate dev --name add-google-id
```

**Schema change:**
```prisma
model User {
  // ... existing fields ...
  googleId  String?  @unique
  @@index([googleId])
}
```

**Affected:**
- `prisma/schema.prisma` — add field + index
- Regenerate Prisma client

**Verification:** `prisma db push` succeeds, migration file generated.

### Step 2: Add Dependencies

```bash
npm install google-auth-library @react-oauth/google
```

**Verification:** Import `google-auth-library` resolves without errors.

### Step 3: Environment Variables

**.env.example:**
```
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_SIGNIN_ENABLED=false
```

Same additions to `.env.docker.example`.

**Verification:** Server starts without errors when env vars are missing (graceful fallback).

### Step 4: Google Auth Utility

**New file:** `src/lib/google-auth.ts`

```typescript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GoogleTokenPayload {
  sub: string;       // Google user ID (immutable)
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
  hd?: string;       // Google Workspace hosted domain
}

export async function verifyGoogleToken(credential: string): Promise<GoogleTokenPayload> {
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload()!;

  // Validate required fields
  if (!payload.sub || !payload.email || !payload.email_verified) {
    throw new Error('Invalid Google token payload');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    email_verified: payload.email_verified,
    hd: payload.hd,
  };
}
```

**Verification:** Unit test with mock token passes.

### Step 5: Validator Schema

**Modify:** `src/lib/validators.ts`

Add:
```typescript
export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});

export const googleLinkSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});
```

### Step 6: Google Sign-In API Route

**New file:** `src/app/api/auth/google/route.ts`

**Logic:**
1. Validate body with `googleAuthSchema`
2. Call `verifyGoogleToken(credential)`
3. Extract `{ sub, email, name }`
4. Look up user by `googleId`:
   - Found → check status (ACTIVE/PENDING/REJECTED), generate tokens if active
   - Not found → check if email exists in DB:
     - Exists → return 409 with `{ needsLink: true, email }`
     - Not found → create user (role: STUDENT, isVerified: true, status: ACTIVE, googleId: sub)
5. Generate 3 JWT tokens (same as login route)
6. Set 3 cookies (same options as login route)
7. Call `syncDashboardUser()` for newly created users
8. Return same response shape as login

### Step 7: Account Linking API Route

**New file:** `src/app/api/auth/google/link/route.ts`

**Logic:**
1. Authenticate user (require existing session via `authenticate(req)`)
2. Validate body
3. Verify Google token
4. Check that Google email matches authenticated user's email
5. Check that `googleId` is not already linked to another user
6. Update user record: set `googleId`
7. Return success

### Step 8: Account Unlinking API Route

**New file:** `src/app/api/auth/google/unlink/route.ts`

**Logic:**
1. Authenticate user
2. Check that user has a password set (prevent lockout)
3. Set `googleId: null` on user record
4. Return success

### Step 9: Frontend Google Sign-In Button

**Modify:** `src/app/login/page.tsx`

Changes:
1. Import `GoogleOAuthProvider` and `GoogleLogin` from `@react-oauth/google`
2. Add `GOOGLE_SIGNIN_ENABLED` check — conditionally render the button
3. Add Google Sign-In button below the password login form
4. On credential response:
   - POST to `/api/auth/google` with `{ credential }`
   - On success → `window.location.assign(destination)` (same pattern)
   - On 409 → Show "Link Account" modal
   - On error → `pushToast(message, "error")` (same pattern)
5. Add "Link Account" modal for conflict resolution:
   - Shows "This email is already registered. Log in with your password first, then link Google."
   - Redirects to login with `?linkGoogle=true` flow
6. Add `GoogleOAuthProvider` wrapper — either in layout or login page

**Important:** The Google Sign-In button should use the `useOneTap` and `auto_select` configurations carefully — avoid auto-selecting for returning users who might want password login instead.

### Step 10: Login Route Enhancement (Optional)

**Modify:** `src/app/api/auth/login/route.ts`

Add a check: if a user with this email exists and has `googleId` but no `password`, they can ONLY sign in with Google. Return an appropriate error message.

(Optional — can be deferred if Google accounts always have a password set during creation.)

---

## Testing Plan

### Unit Tests

| Test | File | What to Test |
|---|---|---|
| ID token verification | `src/lib/google-auth.test.ts` | Valid token, expired token, wrong audience, missing email, missing sub |
| Token validation | `src/lib/google-auth.test.ts` | Error handling for malformed tokens, network errors |
| Schema validation | `src/lib/validators.test.ts` | `googleAuthSchema` — valid credential, empty string, missing field |

### Integration Tests

| Test | Route | What to Test |
|---|---|---|
| Google login (new user) | `POST /api/auth/google` | Creates user, sets 3 cookies, returns user data |
| Google login (existing Google user) | `POST /api/auth/google` | Looks up by googleId, generates tokens, no DB changes |
| Google login (email exists) | `POST /api/auth/google` | Returns 409 with needsLink |
| Google login (suspended user) | `POST /api/auth/google` | Returns 403 |
| Google login (pending faculty) | `POST /api/auth/google` | Returns 403 (if faculty approval flow) |
| Account link | `POST /api/auth/google/link` | Links Google to existing authenticated user |
| Account unlink | `POST /api/auth/google/unlink` | Removes googleId, requires password exists |
| Refresh token (Google user) | `POST /api/auth/refresh` | Works identically — no special handling needed |
| Logout (Google user) | `POST /api/auth/logout` | Works identically |
| Protected API (Google user) | Any protected route | Works identically — `authenticate()` reads token cookie |

### Authentication Tests

| Scenario | Expected Behavior |
|---|---|
| User registers with email, then signs in with Google (same email) | 409 — must link accounts |
| User signs in with Google, then signs in with email/password | 401 — no password set, must use Google |
| User links Google, then signs in with Google | Normal login |
| User links Google, then signs in with email/password | Existing password still works |
| User unlinks Google, then signs in with Google | 409 — must re-link |
| User with googleId but deleted from DB | 401 |
| Google token with non-institutional email | Creates account (if not restricted to @tcetmumbai.in) |

### Security Tests

| Test | Expected Behavior |
|---|---|
| Replay Google credential token | Rejected — Google verifies `exp` |
| Wrong Google Client ID token | Rejected — `aud` mismatch |
| Manually crafted JWT in credential field | Rejected — not a valid Google ID token |
| XSS attempt in login page credential input | Rejected by Zod validation |
| Rate limit exceeded | 429 |

### Regression Tests

| Feature | Ensure Unchanged |
|---|---|
| Email/password login | Same flow, same cookies |
| Student registration + OTP | No change |
| Faculty registration + approval | No change |
| Password reset | No change |
| Token refresh | Same endpoint, same cookies |
| Dashboard SSO | `coe_shared_token` generated identically |
| Dashboard sync | Fires same `syncDashboardUser()` |
| Navbar auth state | Reads same cookies |
| All protected API routes | `authenticate()` reads same cookies |

### OAuth Failure Scenarios

| Scenario | Frontend Behavior |
|---|---|
| Popup blocked | Show toast: "Please allow popups for Google Sign-In" |
| User closes popup | Silent — user stays on login page |
| Network error | Show toast: "Network error. Please try again." |
| Invalid credential | Show toast: "Login failed. Please try again." |
| Email already exists | Show "Link Account" modal |
| Account suspended | Show error: "Your account has been suspended." |

---

## Deployment & Migration Strategy

### Pre-deployment Checklist

- [ ] Google Cloud Console project created
- [ ] OAuth 2.0 Web Client configured with authorized origins
- [ ] Test OAuth client for localhost + staging
- [ ] Production OAuth client for `.tcetcercd.in`
- [ ] Environment variables set in all environments

### Database Migration

```bash
# Create migration
npx prisma migrate dev --name add-google-id

# Test locally
npx prisma migrate deploy

# Apply to staging
npx prisma migrate deploy

# Apply to production
npx prisma migrate deploy
```

**Rollback plan:**
```bash
prisma migrate down  # Only if migration is the latest
# OR manually:
ALTER TABLE users DROP COLUMN googleId;
DROP INDEX users_googleId_idx;
```

### Feature Flag

Use `GOOGLE_SIGNIN_ENABLED` env var:

```typescript
const googleSignInEnabled = process.env.GOOGLE_SIGNIN_ENABLED === 'true';
```

- If not set → Google Sign-In button is hidden
- If `true` → Google Sign-In is available
- Toggle without redeployment (env var change + process restart)

### Backwards Compatibility

| Concern | Compatibility |
|---|---|
| Existing users | Unaffected — no schema changes to existing fields |
| Existing API routes | Unchanged |
| Existing cookies | Same structure, same names |
| Existing sessions | Unchanged |
| Dashboard SSO | Same shared token generation |
| Database queries | New `googleId` index has no impact on existing queries |
| Prisma client | Regenerated — backward compatible |

### Zero-Downtime Deployment

1. Deploy database migration first (add nullable `googleId` column)
2. Deploy application code (Google Sign-In is gated by feature flag)
3. Enable feature flag (`GOOGLE_SIGNIN_ENABLED=true`)
4. Monitor for errors
5. If issues → disable feature flag (env var change + restart)

---

## Highest-Risk Areas

| Risk | Area | Mitigation |
|---|---|---|
| **Account takeover via email linking** | Account linking flow | Require existing session + password before linking. The 409 response does NOT auto-link. |
| **Mail-chive sentive token exposure** | Token verification | Always verify server-side with `google-auth-library`, never trust client-side payload |
| **Faculty approval bypass** | Role assignment | Google Sign-In creates users with `status: PENDING` for faculty — admin must approve |
| **Rate limit abuse** | `/api/auth/google` | Add rate limiting (same pattern as OTP rate limiting) |
| **Missing env vars** | Production deployment | Feature flag + graceful degradation — if `GOOGLE_CLIENT_ID` is missing, button hides |

---

## Assumptions

1. Google Sign-In will be used primarily by students and faculty with `@tcetmumbai.in` emails
2. Admin accounts will NOT be created via Google Sign-In
3. The existing JWT secret rotation and cookie configuration remain unchanged
4. The project dashboard (`project-dashboard/`) does NOT need Google Sign-In — it relies on the shared token
5. Rate limiting on `/api/auth/google` will use the same pattern as OTP rate limiting
6. Users who register via Google will have `isVerified: true` (Google verified the email)
7. Faculty registering via Google still require admin approval (same as email registration)

---

## Files Summary

### New Files (4)

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/google-auth.ts` | ~60 | Google ID token verification |
| `src/app/api/auth/google/route.ts` | ~120 | Google Sign-In callback handler |
| `src/app/api/auth/google/link/route.ts` | ~80 | Account linking handler |
| `src/app/api/auth/google/unlink/route.ts` | ~50 | Account unlinking handler |

### Modified Files (5)

| File | Change Size | Change |
|---|---|---|
| `prisma/schema.prisma` | +2 lines | Add `googleId String? @unique` + `@@index([googleId])` |
| `src/app/login/page.tsx` | ~+80 lines | Add Google Sign-In button + link modal + credential handler |
| `src/lib/validators.ts` | +8 lines | Add `googleAuthSchema` and `googleLinkSchema` |
| `.env.example` | +5 lines | Add Google OAuth env vars |
| `.env.docker.example` | +5 lines | Add Google OAuth env vars |

### Dependencies Added (2)

| Package | Version | Size |
|---|---|---|
| `google-auth-library` | ^9.x | ~500KB |
| `@react-oauth/google` | ^0.12.x | ~50KB |

---

## Commit Strategy (Independent Commits)

| Commit # | Description | Files |
|---|---|---|
| 1 | **Schema + Dependencies** — Add googleId to schema, install packages | `prisma/schema.prisma`, `package.json` |
| 2 | **Env vars + Google utility** — Add env vars, create google-auth.ts | `.env.example`, `.env.docker.example`, `src/lib/google-auth.ts` |
| 3 | **API routes** — Add /api/auth/google, /link, /unlink + validator | `src/app/api/auth/google/*`, `src/lib/validators.ts` |
| 4 | **Frontend** — Add Google Sign-In button + link account modal | `src/app/login/page.tsx` |
| 5 | **Testing** — Add unit + integration tests | `src/lib/google-auth.test.ts`, `src/app/api/auth/google/*.test.ts` |

Each commit is independently deployable. The Google Sign-In button is hidden until `GOOGLE_SIGNIN_ENABLED=true` is set.
