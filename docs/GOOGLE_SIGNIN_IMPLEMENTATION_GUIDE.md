# Google Sign-In: Implementation Engineering Handbook

**Read this before writing any code.**

This document is the engineering playbook for implementing Google Sign-In in the CoE-Main repository. It tells every implementation agent exactly what they own, what they must not change, where changes belong, and which shared infrastructure already exists.

The companion document `google-sign-in-implementation-spec.md` explains **what** to build. This document explains **how to modify this specific codebase safely**.

---

## 1. Repository Overview — Authentication Architecture

This project uses a custom JWT-based authentication system. No auth framework (NextAuth, Passport) is involved.

### 1.1 Token System (`src/lib/jwt.ts`)

| Token | Secret | TTL | Purpose |
|---|---|---|---|
| `accessToken` | `JWT_ACCESS_SECRET` | 8h | Short-lived auth for CoE Main |
| `refreshToken` | `JWT_REFRESH_SECRET` | 7d | Long-lived token rotation |
| `coe_shared_token` | `JWT_ACCESS_SECRET` | 7d | Cross-subdomain SSO for Dashboard |

**Must reuse these functions.** Do not create new token types or new secrets for auth tokens.

### 1.2 Cookie System (`src/lib/shared-auth.ts` + route handlers)

Three httpOnly cookies are set on every login. Reuse the existing `getSharedCookieOptions()` and cookie configuration. Google Sign-In sets the same cookies as email/password login.

### 1.3 RBAC (`src/lib/api-helpers.ts` → `authorize()`)

Role-based access control is enforced per-API-route via `authenticate(req)` + `authorize(user, ...roles)`. Google Sign-In produces the same `TokenPayload` as email/password login. No RBAC changes are needed.

### 1.4 Middleware

No middleware exists in `/src/` (main app). The project-dashboard has its own middleware that reads the `coe_shared_token` cookie. Google Sign-In generates this cookie identically — no middleware changes needed.

### 1.5 Dashboard Sync (`src/lib/dashboard-sync.ts`)

Fire-and-forget HTTP POST to the dashboard. Never blocks login. Called after user creation (email registration and Google registration). Reuse as-is.

### 1.6 OTP System (`api/auth/verify-otp`, `api/auth/resend-otp`)

OTP is for email/password registration only. Google users skip OTP entirely because Google has verified the email. The OTP system is unchanged.

### 1.7 Refresh Flow (`api/auth/refresh`)

Reads `refreshToken` cookie, verifies with `JWT_REFRESH_SECRET`, re-issues tokens. Google users get refresh tokens on login — this flow works identically. **Do not modify.**

### 1.8 Auth Utilities

| File | Purpose | Reuse |
|---|---|---|
| `src/lib/jwt.ts` | Token generation/verification | Must reuse |
| `src/lib/api-helpers.ts` | `authenticate()`, `authorize()`, `successRes()`, `errorRes()`, `useSecureCookies()` | Must reuse |
| `src/lib/shared-auth.ts` | `getSharedCookieOptions()`, `buildSharedTokenPayload()`, `SHARED_COOKIE_NAME` | Must reuse |
| `src/lib/callback-url.ts` | `isValidCallbackUrl()`, `DEFAULT_CALLBACK_URL` | Must reuse |
| `src/lib/dashboard-sync.ts` | `syncDashboardUser()` | Must reuse |
| `src/lib/activity-log.ts` | `logActivity(event, context)` | Must reuse for audit logging |

---

## 2. Existing Files — Modification Rules

| File | Purpose | May Modify? | Expected Changes | Shared Ownership | Risk |
|---|---|---|---|---|---|
| `src/lib/jwt.ts` | JWT generation + verification | **NO** | None. Google Sign-In reuses existing functions. | No | High |
| `src/lib/api-helpers.ts` | Auth helpers, response utilities | **NO** | None. `authenticate()` reads accessToken cookie — works for Google users. | No | High |
| `src/lib/shared-auth.ts` | Shared cookie options, payload builder | **NO** | None. Google users get the same shared token. | No | High |
| `src/lib/callback-url.ts` | Callback URL validation | **NO** | None. | No | Low |
| `src/lib/dashboard-sync.ts` | Fire-and-forget dashboard sync | **NO** | None. Called after Google registration with same payload shape. | No | Medium |
| `src/lib/activity-log.ts` | Structured audit logging | **NO** | None. Reuse `logActivity()` for new Google events. | No | Low |
| `src/lib/validators.ts` | Zod validation schemas | **YES** | Add `googleAuthSchema`, `googleRegistrationSchema`. Do not modify existing schemas. | Shared (Agent A) | Low |
| `prisma/schema.prisma` | Database schema | **YES** | Add `googleId String? @unique` + `@@index([googleId])`. Password field unchanged. | Agent A | High |
| `src/app/api/auth/login/route.ts` | Password login handler | **YES** | +4 lines: add `if (!isMatch && user.googleId)` guard after bcrypt compare. | Agent C | Medium |
| `src/app/api/auth/forgot-password/route.ts` | Password reset OTP | **NO** | No changes needed (password always present — flow works for all users). | None | Low |
| `src/app/api/auth/reset-password/route.ts` | Password reset | **NO** | No changes needed (password always present — flow works for all users). | None | Low |
| `src/app/login/page.tsx` | Login page | **YES** | Add "Continue with Google" button + OAuth response handler + link prompt modal. | Agent D | Medium |
| `prisma/migrations/` | Migration files | **YES** | One new migration: add googleId column. | Agent A | High |
| `package.json` | Dependencies | **YES** | Add `google-auth-library`, `@react-oauth/google`. | Agent A | Low |
| `.env.example` | Env template | **YES** | Add 5 vars (see Section 20 of spec). | Agent A | Low |
| `.env.docker.example` | Docker env template | **YES** | Same 5 vars. | Agent A | Low |

### Files That Must NEVER Be Modified

| File | Why |
|---|---|
| `src/lib/jwt.ts` | Token generation/verification is the foundation of the auth system. Any change risks invalidating all existing sessions. |
| `src/app/api/auth/refresh/route.ts` | Token rotation must remain unchanged. Google users get refresh tokens — this endpoint already handles them. |
| `src/app/api/auth/logout/route.ts` | Clears 3 cookies. Google users need the same cookies cleared. No change needed. |
| `src/app/api/auth/register/student/route.ts` | Email/password student registration is completely separate from Google flow. |
| `src/app/api/auth/register/faculty/route.ts` | Faculty registration + admin approval is completely separate from Google flow. |
| `src/app/api/auth/verify-otp/route.ts` | OTP verification is for email/password users. Google users skip OTP. |
| `src/app/api/auth/resend-otp/route.ts` | OTP resend is for email/password users. Google users skip OTP. |
| `src/app/layout.tsx` | Reads accessToken cookie from request — works identically for Google users. |
| `src/components/Navbar.tsx` | Receives user prop from layout — same shape for all users. |
| `project-dashboard/src/middleware.ts` | Reads coe_shared_token cookie — generated identically. |
| `project-dashboard/src/lib/coe-auth.ts` | Token verification uses same JWT secret. No change needed. |
| `project-dashboard/src/lib/resolve-user.ts` | User provisioning from headers — Google users get the same headers. |
| All protected API routes | `authenticate()` + `authorize()` work on token cookies, not registration method. |

---

## 3. New Files

### 3.1 `src/lib/google-auth.ts`

| Property | Value |
|---|---|
| **Purpose** | Server-side Google ID token verification |
| **Responsibilities** | Initialize `OAuth2Client` with `GOOGLE_CLIENT_ID`. Export `verifyGoogleToken(credential)` that returns `{ sub, email, name, email_verified }`. Handle verification errors. |
| **Exports** | `verifyGoogleToken(credential: string): Promise<GoogleTokenPayload>` |
| **Dependencies** | `google-auth-library` |
| **May import from** | Nothing from the codebase (standalone utility) |
| **Must NOT import** | Any project files (jwt.ts, prisma, etc.) |
| **Risk** | Medium — incorrect verification logic could accept invalid tokens |

### 3.2 `src/app/api/auth/google/route.ts`

| Property | Value |
|---|---|
| **Purpose** | Single OAuth entry point. Accepts credential, determines action (login/register/link_prompt/etc.). |
| **Responsibilities** | Verify token, look up user by googleId/email, determine action, generate/return `pending_reg` cookie for new registrations, return user data for existing users. |
| **Exports** | `POST()` (Next.js App Router) |
| **Dependencies** | `googleAuthSchema` (from validators.ts), `verifyGoogleToken` (from google-auth.ts), `generateAccessToken/RefreshToken/SharedToken` (from jwt.ts), `buildSharedTokenPayload/getSharedCookieOptions/SHARED_COOKIE_NAME` (from shared-auth.ts), `successRes/errorRes/useSecureCookies` (from api-helpers.ts), `logActivity` (from activity-log.ts), `ACCESS_TOKEN_TTL_SECONDS/REFRESH_TOKEN_TTL_SECONDS/SHARED_TOKEN_TTL_SECONDS` (from jwt.ts) |
| **Must NOT** | Create user records, modify existing user records (except linking via `/link`), bypass feature flag, skip domain validation |
| **Risk** | High — incorrect logic could allow invalid logins or fail legit ones |

### 3.3 `src/app/api/auth/register/google/route.ts`

| Property | Value |
|---|---|
| **Purpose** | Complete Google registration after manual form submission. Reads `pending_reg` cookie, validates form, creates user. |
| **Responsibilities** | Verify registration JWT, generate random password, run Prisma transaction (check + create), set auth cookies, sync dashboard. |
| **Exports** | `POST()` (Next.js App Router) |
| **Dependencies** | `googleRegistrationSchema` (from validators.ts), prisma, `crypto`, `bcryptjs`, `generateAccessToken/RefreshToken/SharedToken`, `buildSharedTokenPayload/getSharedCookieOptions/SHARED_COOKIE_NAME`, `successRes/errorRes/useSecureCookies`, `logActivity`, `syncDashboardUser` |
| **Must NOT** | Skip domain re-validation, bypass `pending_reg` signature verification, create user records outside transaction, let dashboard sync block login |
| **Risk** | High — user creation is the most critical write path |

### 3.4 `src/app/api/auth/google/link/route.ts`

| Property | Value |
|---|---|
| **Purpose** | Link Google identity to existing user account (Students, Faculty, or Admin). |
| **Responsibilities** | Verify Google ID token, find user by email, set googleId if not already set, issue JWT tokens. |
| **Exports** | `POST()` (Next.js App Router) |
| **Dependencies** | `googleAuthSchema`, `verifyGoogleToken`, prisma, jwt.ts/shared-auth.ts/api-helpers.ts exports |
| **Must NOT** | Auto-link without explicit user confirmation, overwrite existing googleId, create new user records |
| **Risk** | Medium — linking the wrong account is hard to undo |

### 3.5 `src/app/register/complete/page.tsx`

| Property | Value |
|---|---|
| **Purpose** | Registration completion form for new Google users. Prefills name, collects UID and phone. |
| **Responsibilities** | Check `pending_reg` cookie exists (via server or API), display email (read-only), prefill name (editable), collect UID + phone, submit to `/api/auth/register/google`, handle errors without clearing form state. |
| **Exports** | Default page component (client component with `'use client'`) |
| **Dependencies** | `@react-oauth/google` (if needed for re-auth), existing `redirect`/`useRouter`, `useToast` from `@/components/ToastProvider` |
| **Must NOT** | Make direct database calls, bypass the `pending_reg` cookie, store Google credential in DOM/localStorage |
| **Risk** | Medium — poor error handling could lose user input on validation failures |

---

## 4. Ownership Matrix

| Agent | Owns | Files | Depends On |
|---|---|---|---|
| **A** | Database + Schema + Dependencies | `prisma/schema.prisma`, `prisma/migrations/`, `package.json`, `.env.example`, `.env.docker.example`, `src/lib/validators.ts` (+new schemas) | Nothing |
| **B** | Google Auth Utility | `src/lib/google-auth.ts` (new) | `google-auth-library` package (from Agent A) |
| **C** | Backend API Routes | `src/app/api/auth/google/route.ts` (new), `src/app/api/auth/register/google/route.ts` (new), `src/app/api/auth/google/link/route.ts` (new), `src/app/api/auth/login/route.ts` (modify) | Agent A (schema types, validators), Agent B (google-auth utility) |
| **D** | Frontend | `src/app/login/page.tsx` (modify), `src/app/register/complete/page.tsx` (new) | Agent C (API routes must exist) |
| **E** | Testing | `src/lib/__tests__/google-auth.test.ts`, integration tests for API routes, E2E tests for login flow | All agents |

---

## 5. File-by-File Modification Plan

### `prisma/schema.prisma`

**Current:** `User` model with `password String` (required).
**Change:** Add after `uid`:
```prisma
googleId    String?   @unique
// ...in the index block:
@@index([googleId])
```
**Password field unchanged** (String, still required).
**Lines affected:** +2 (field + index). 0 changed.
**Dependencies:** None.
**Merge conflict risk:** Low — additive only.
**Regression risk:** None — new nullable field.
**Testing:** Run `prisma db push` + `prisma generate`.

### `src/lib/validators.ts`

**Current:** Auth validators for email/password registration, login, OTP.
**Change:** Add two new schemas at the end of the auth validators section:
```typescript
export const googleAuthSchema = z.object({ credential: z.string().min(1) });
export const googleRegistrationSchema = z.object({
  name: z.string().min(2),
  uid: z.string().regex(/^\d{2}-[A-Z]+[A-Z]\d{2,3}-\d{2}$/),
  phone: z.string().min(10),
});
```
**Lines affected:** +12 at end of file.
**Dependencies:** None.
**Merge conflict risk:** Low — additive only.
**Regression risk:** None — existing schemas untouched.

### `src/app/api/auth/login/route.ts`

**Current:** Lookup user → bcrypt.compare → error if no match.
**Change:** After `bcrypt.compare(password, user.password)` returns false, add:
```typescript
if (!isMatch) {
  if (user.googleId) {
    return errorRes('Invalid credentials. Try signing in with Google.', [], 400);
  }
  return errorRes('Invalid email/UID or password.', [], 401);
}
```
**Lines affected:** ~4 lines added after existing `if (!isMatch)` block.
**Dependencies:** None (schema already has `googleId` field).
**Merge conflict risk:** Medium — edit near existing error handling.
**Regression risk:** Medium — changes the error response for Google users with failed password attempts. Local-only user flow is unchanged.

### `src/app/login/page.tsx`

**Current:** Single-page app with login form, student registration, faculty registration, OTP modal.
**Change:** Add "Continue with Google" button. On credential response, switch on `action`:
- `login` → `window.location.assign(destination)` (existing pattern)
- `register` → redirect to `/register/complete`
- `link_prompt` → show confirmation modal → POST `/api/auth/google/link`
- `pending` → show "awaiting approval" message
- `rejected` → show "rejected" message
- `invalid_domain` → show domain requirement

**Lines affected:** ~80 lines added (Google button + OAuth handler + link prompt modal).
**Dependencies:** API routes must exist (Agent C).
**Merge conflict risk:** High — large single-file SPA. Coordinate with Agent C.
**Regression risk:** Medium — existing login/register flows must remain untouched.

---

## 6. Dependency Graph

```
                    ┌─────────────────┐
                    │                 │
                    │  Agent A        │
                    │  Schema + Env   │
                    │  + Validators   │
                    │  + Dependencies │
                    │                 │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              │
   ┌─────────────────┐  ┌──────────┐       │
   │                 │  │          │       │
   │  Agent B        │  │ Agent C  │       │
   │  google-auth.ts │  │ API Rts  │       │
   │                 │  │          │       │
   └─────────────────┘  └────┬─────┘       │
                             │              │
                             ▼              │
                    ┌─────────────────┐     │
                    │                 │     │
                    │  Agent D        │◄────┘
                    │  Frontend       │
                    │                 │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │                 │
                    │  Agent E        │
                    │  Testing        │
                    │                 │
                    └─────────────────┘
```

**Critical path:** A → (B ∥ C) → D → E

**Can parallelize:**
- Agent A + Agent B: No dependency between them (A provides package, but B only needs the package name)
- Agent C starts after Agent A finishes (needs Prisma types from generated client)

**Cannot parallelize:**
- Agent D depends on Agent C (API routes must be deployed for frontend to call)
- Agent E depends on everything

---

## 7. Shared Engineering Rules

These rules are mandatory. Violations will be rejected in code review.

### Authentication Rules

- **Never generate JWT manually.** Always use `generateAccessToken()`, `generateRefreshToken()`, `generateSharedToken()` from `src/lib/jwt.ts`.
- **Never duplicate cookie logic.** Always use `getSharedCookieOptions()` and `buildSharedTokenPayload()` from `src/lib/shared-auth.ts`.
- **Never bypass `authenticate()`.** All protected routes read tokens via `api-helpers.ts`.
- **Never bypass `authorize()`.** Role checks are centralized.
- **Never create new auth middleware.** The main app has no middleware. Don't add one.
- **Never modify the refresh flow.** `POST /api/auth/refresh` works for all users.
- **Never modify the logout flow.** Same 3 cookies for all users.
- **Never modify dashboard sync behavior.** Always fire-and-forget, never block login.

### Validation Rules

- **Always use Zod schemas.** Every API endpoint validates input via a schema from `validators.ts`.
- **Never trust client-side validation.** Server-side Zod validation is the source of truth.
- **Never return raw Prisma errors.** Always map errors to stable codes (Section 7 of spec).

### Error Handling Rules

- **Use stable error codes, not messages.** Frontend switches on `error.code`. Messages can change.
- **Always use existing response helpers.** `successRes()` and `errorRes()` from `api-helpers.ts`.
- **Never throw 500 for known failure modes.** Map to appropriate 4xx with error code.

### Transaction Rules

- **Keep transactions minimal.** Only uniqueness checks + user creation inside transactions.
- **Never roll back a user because dashboard sync fails.** Dashboard sync is fire-and-forget, outside transaction.
- **Never include JWT generation or cookie setting inside transactions.** These are stateless operations.

### Registration Rules

- **Never create a user record before manual form submission.** The `pending_reg` JWT is the intermediate state.
- **Always generate a random password for Google users.** Use `crypto.randomBytes(32).toString('hex')` + `bcrypt.hash(randomPw, 12)`.
- **Never clear `pending_reg` on validation errors.** Only clear on success or expiration.
- **Always re-verify the email domain in the registration route.** Defense in depth.

### Feature Flag Rules

- **Always check `GOOGLE_SIGNIN_ENABLED` before processing Google requests.** Return `GOOGLE_FEATURE_DISABLED` (404) when disabled.
- **Never expose Google UI elements when the flag is disabled.** Button hidden, provider not initialized.

---

## 8. Code Standards

### Naming

- Error codes: `GOOGLE_*` prefix, UPPER_SNAKE_CASE (e.g., `GOOGLE_TOKEN_INVALID`)
- Audit events: Same format as existing — `GOOGLE_LOGIN`, `GOOGLE_REGISTRATION_COMPLETED`
- Cookie names: `pending_reg` (generic, not Google-specific)
- Variables: `googleId` (camelCase, matches Prisma field), `credential` (the Google ID token string)

### Folder Structure

```
src/
  app/api/auth/
    google/
      route.ts              # POST /api/auth/google
    register/
      google/
        route.ts            # POST /api/auth/register/google
    google/
      link/
        route.ts            # POST /api/auth/google/link
  app/register/
    complete/
      page.tsx              # /register/complete page
  lib/
    google-auth.ts          # Token verification utility
```

### Error Handling

All API responses follow the existing pattern:
```typescript
// Success:
successRes(data, message, status);

// Error:
errorRes(message, [errorCode], status);
// The frontend reads error.code from the errors array
```

### Logging

Always use `logActivity(event, context)` from `src/lib/activity-log.ts`:
```typescript
import { logActivity } from '@/lib/activity-log';

logActivity('GOOGLE_LOGIN', { email, googleId: sub });       // INFO
logActivity('GOOGLE_LOGIN_FAILED', { email, error: code });  // WARN
```

Never use `console.log` or `console.error` directly for audit events.

### Database Access

- Read/write through Prisma only (singleton from `src/lib/prisma.ts`).
- Use Prisma transactions for atomicity (Section 7.2 of spec).
- Catch unique constraint errors and map to stable codes.
- Never write raw SQL unless required by migration.

---

## 9. API Contract Summary

### `POST /api/auth/google`

| Property | Value |
|---|---|
| **Input** | `{ credential: string }` via `googleAuthSchema` |
| **Auth required** | No |
| **Rate limit** | 30 req/min/IP |
| **Cookies set** | `pending_reg` (if `action: "register"`); `accessToken`, `refreshToken`, `coe_shared_token` (if `action: "login"`) |
| **DB reads** | User lookup by googleId, then by email |
| **DB writes** | None (registration JWT is stateless) |
| **Audit events** | `GOOGLE_LOGIN` (on success); `GOOGLE_LOGIN_FAILED` (on failure); `GOOGLE_REGISTRATION_STARTED` (on `pending_reg` creation); `GOOGLE_PENDING_DENIED`/`GOOGLE_REJECTED_DENIED` (on faculty blocks) |
| **Dashboard sync** | None |
| **Feature flag** | Check `GOOGLE_SIGNIN_ENABLED` — return `GOOGLE_FEATURE_DISABLED` (404) if false |

### `POST /api/auth/register/google`

| Property | Value |
|---|---|
| **Input** | `{ name, uid, phone }` via `googleRegistrationSchema` + `pending_reg` cookie |
| **Auth required** | No (the `pending_reg` cookie proves Google auth) |
| **Rate limit** | 10 req/min/IP |
| **Cookies set** | `pending_reg` cleared; `accessToken`, `refreshToken`, `coe_shared_token` set |
| **DB reads** | User lookup by email, uid, googleId (inside transaction) |
| **DB writes** | Create user (inside transaction) |
| **Audit events** | `GOOGLE_REGISTRATION_COMPLETED` |
| **Dashboard sync** | Fire-and-forget `syncDashboardUser()` after transaction |
| **Feature flag** | Check `GOOGLE_SIGNIN_ENABLED` |

### `POST /api/auth/google/link`

| Property | Value |
|---|---|
| **Input** | `{ credential: string }` via `googleAuthSchema` |
| **Auth required** | No (Google credential proves identity) |
| **Rate limit** | 10 req/min/IP |
| **Cookies set** | `accessToken`, `refreshToken`, `coe_shared_token` |
| **DB reads** | User lookup by email |
| **DB writes** | Update user.googleId |
| **Audit events** | `GOOGLE_ACCOUNT_LINKED` (on success); `GOOGLE_ACCOUNT_LINK_FAILED` (on failure) |
| **Dashboard sync** | None (user already exists in dashboard) |
| **Feature flag** | Check `GOOGLE_SIGNIN_ENABLED` |

### `POST /api/auth/login` (modified — +4 lines)

| Property | Value |
|---|---|
| **Change** | After `bcrypt.compare` returns false: `if (user.googleId)` → return `GOOGLE_ACCOUNT_ONLY` instead of generic error |
| **Unchanged** | Local-only user flow, SUCCESS path, all cookie handling |

---

## 10. Database Rules

### Allowed Queries

- User lookup by `googleId` (new index, O(1))
- User lookup by `email` (existing unique constraint)
- User lookup by `uid` (existing unique constraint)

### Transactions

The registration creation must use a Prisma interactive transaction:
```typescript
await prisma.$transaction(async (tx) => {
  // Read checks
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('EMAIL_EXISTS');

  // Write
  return tx.user.create({ data: { ... } });
});
```

### Forbidden Schema Changes

- Do NOT make `password` nullable. Keep `String` (required).
- Do NOT add `avatar`/`picture` fields (out of scope).
- Do NOT add provider/identity tables (over-engineering).

### Migration Order

1. Add `googleId String? @unique` column (nullable — existing rows get NULL)
2. Add `@@index([googleId])` for query performance
3. Both changes in a single migration
4. Migration is additive and backward-compatible

---

## 11. Frontend Rules

### Allowed API Calls

| Endpoint | Context |
|---|---|
| `POST /api/auth/google` | After Google OAuth popup returns credential |
| `POST /api/auth/register/google` | After user submits registration form |
| `POST /api/auth/google/link` | After user confirms account linking |

### State Management

- No global auth context on frontend (auth state is server-rendered from cookies)
- Use React local state for form inputs
- On login success: `window.location.assign(destination)` triggers full navigation so server re-renders navbar
- On registration success: same full navigation

### Error Handling

- Switch on `error.code`, not `error.message`
- Show user-friendly messages mapped from error codes
- Preserve form data on validation errors (don't clear fields)
- Preserve `pending_reg` cookie on validation errors

### Popup Handling

- Google OAuth popup: handle `popup_blocked` event → show toast
- User closes popup: silent (no error state)
- Duplicate popup: prevent second popup while one is open

### Accessibility

- Google Sign-In button: proper aria-label, keyboard accessible
- Loading states: disabled button with spinner
- Error messages: role="alert" for screen readers
- Link prompt modal: focus trap, escape to close, aria-modal

---

## 12. Testing Responsibilities

### Agent E Owns All Tests

| Test Type | Scope | Agent Dependencies |
|---|---|---|
| **Unit** | `google-auth.ts` (valid token, expired, wrong aud, missing email, missing sub) | None |
| **Unit** | Validator schemas (valid/invalid input for `googleAuthSchema`, `googleRegistrationSchema`) | None |
| **Integration** | `POST /api/auth/google` (new user, returning, existing email, faculty pending, faculty rejected, domain mismatch, feature flag disabled) | Agent C |
| **Integration** | `POST /api/auth/register/google` (valid submission, expired cookie, tampered cookie, missing cookie, duplicate UID, duplicate email race) | Agent C |
| **Integration** | `POST /api/auth/google/link` (valid link, already linked, email not found, token invalid) | Agent C |
| **Integration** | Login route guard (Google-only user enters password, dual-provider enters wrong password, local user enters wrong password) | Agent C |
| **Regression** | Existing login flow (email/password) unchanged | Agent C |
| **Regression** | Existing registration flow (student email + OTP) unchanged | Agent C |
| **Regression** | Existing refresh flow unchanged | Agent C |
| **Frontend** | Login page renders Google button conditionally (feature flag on/off) | Agent D |
| **Frontend** | Registration page handles cookie state (present, expired, missing) | Agent D |
| **Frontend** | Link prompt modal renders and submits correctly | Agent D |

### Acceptance Criteria

| Criterion | Verification |
|---|---|
| New Google user can complete full registration | E2E test |
| Returning Google user can log in | Integration test |
| Faculty linking does not bypass approval | Integration test + manual |
| Non-institutional email is rejected | Integration test |
| `pending_reg` cookie is preserved on validation errors | Integration test |
| Google user cannot log in when feature flag is disabled | Integration test |
| Existing email/password login is unchanged | Regression test |
| Existing student registration + OTP is unchanged | Regression test |
| Dashboard sync failure does not block login | Manual code review (fire-and-forget) |

---

## 13. Things Agents MUST NOT Change

### Absolutely Forbidden

1. **JWT generation/verification** — `src/lib/jwt.ts`. Any change here invalidates all existing sessions.
2. **Refresh token rotation** — `src/app/api/auth/refresh/route.ts`. Must remain identical.
3. **Logout logic** — `src/app/api/auth/logout/route.ts`. Clears same 3 cookies for all users.
4. **Cookie configuration** — `src/lib/shared-auth.ts`. `getSharedCookieOptions()` returns the same options for all users.
5. **Authorization helpers** — `src/lib/api-helpers.ts`. `authorize()` checks role on `TokenPayload` — same shape for all users.
6. **Authentication helpers** — `src/lib/api-helpers.ts`. `authenticate()` reads token cookie — works identically.
7. **Dashboard sync** — `src/lib/dashboard-sync.ts`. Fire-and-forget with 5s timeout — must never change.
8. **Protected route handlers** — Any existing API route that calls `authenticate()` + `authorize()` must not change.
9. **Student email/password registration** — `src/app/api/auth/register/student/route.ts`. Unchanged flow.
10. **Faculty email/password registration** — `src/app/api/auth/register/faculty/route.ts`. Unchanged flow.
11. **OTP system** — `verify-otp`, `resend-otp`. Unchanged.
12. **Prisma password field** — Must stay `String` (required). Do NOT make nullable.
13. **Root layout** — `src/app/layout.tsx`. Reads accessToken cookie — works identically.
14. **Navbar** — `src/components/Navbar.tsx`. Receives user prop — same shape.
15. **Project dashboard** — Any file in `project-dashboard/`. The shared token is unchanged.

### Why These Are Forbidden

Each of these files represents a working integration. Google Sign-In extends the system by adding NEW code paths, not by changing existing ones. The only exceptions are:
- `login/route.ts` (+4 lines) — to improve UX for Google users who accidentally use the password form
- `validators.ts` (+12 lines) — additive, new schemas only
- `schema.prisma` (+2 lines) — additive, new field only
- `login/page.tsx` (~+80 lines) — additive, Google button + handler

Every other change is in NEW files.

---

## 14. Master Implementation Checklist

### Phase 1 — Agent A (Database + Schema + Config)

- [ ] Add `googleId String? @unique` + `@@index([googleId])` to `prisma/schema.prisma`
- [ ] Run `npx prisma generate` to regenerate client
- [ ] Create migration: `npx prisma migrate dev --name add-google-id`
- [ ] Run `npm install google-auth-library @react-oauth/google`
- [ ] Add 5 environment variables to `.env.example` and `.env.docker.example`
- [ ] Add `googleAuthSchema` and `googleRegistrationSchema` to `src/lib/validators.ts`

### Phase 1 — Agent B (Google Utility)

- [ ] Create `src/lib/google-auth.ts` with `verifyGoogleToken()` function
- [ ] Initialize `OAuth2Client` with `process.env.GOOGLE_CLIENT_ID`
- [ ] Verify: aud, iss, exp (library handles), email_verified, domain
- [ ] Return typed `GoogleTokenPayload` on success
- [ ] Throw typed error on verification failure
- [ ] Unit test: valid token, expired, wrong aud, missing email, missing sub

### Phase 1 — Agent C (API Routes)

- [ ] Create `src/app/api/auth/google/route.ts`
  - [ ] Validate with `googleAuthSchema`
  - [ ] Call `verifyGoogleToken()`
  - [ ] Check `GOOGLE_SIGNIN_ENABLED` feature flag
  - [ ] Look up user by googleId → found → login
  - [ ] Look up user by email → found as FACULTY/ADMIN → link_prompt, pending, or rejected
  - [ ] Look up user by email → found as STUDENT → link_prompt
  - [ ] Not found → validate domain → generate `pending_reg` → action: register
  - [ ] Audit logging for each branch
- [ ] Create `src/app/api/auth/register/google/route.ts`
  - [ ] Read and verify `pending_reg` cookie
  - [ ] Validate with `googleRegistrationSchema`
  - [ ] Generate random password: `crypto.randomBytes(32)` + `bcrypt.hash(12)`
  - [ ] Prisma transaction: check email, uid, googleId unique + create user
  - [ ] Clear `pending_reg` cookie
  - [ ] Generate 3 JWT tokens, set 3 cookies
  - [ ] `logActivity('GOOGLE_REGISTRATION_COMPLETED', ...)`
  - [ ] `syncDashboardUser(user)` (fire-and-forget)
- [ ] Create `src/app/api/auth/google/link/route.ts`
  - [ ] Validate with `googleAuthSchema`
  - [ ] Call `verifyGoogleToken()`
  - [ ] Find user by email
  - [ ] Check googleId not already set
  - [ ] Update user.googleId
  - [ ] Generate 3 JWT tokens, set 3 cookies
  - [ ] `logActivity('GOOGLE_ACCOUNT_LINKED', ...)`
- [ ] Modify `src/app/api/auth/login/route.ts`
  - [ ] After bcrypt.compare fails: `if (user.googleId)` → `GOOGLE_ACCOUNT_ONLY`

### Phase 1 — Agent D (Frontend)

- [ ] Modify `src/app/login/page.tsx`
  - [ ] Add "Continue with Google" button (wrapped in feature flag check)
  - [ ] Add `GoogleOAuthProvider` wrapper
  - [ ] Handle credential response → switch on `action`
  - [ ] Handle `login` → `window.location.assign(destination)`
  - [ ] Handle `register` → redirect to `/register/complete`
  - [ ] Handle `link_prompt` → show modal → POST `/api/auth/google/link`
  - [ ] Handle `pending` → show message
  - [ ] Handle `rejected` → show message
  - [ ] Handle `invalid_domain` → show message
  - [ ] Handle popup blocked → show toast
  - [ ] Handle errors → show toast
- [ ] Create `src/app/register/complete/page.tsx`
  - [ ] Check `pending_reg` cookie exists (via API)
  - [ ] If missing → redirect to `/login`
  - [ ] Display email (read-only)
  - [ ] Prefill name (editable)
  - [ ] UID field with format validation
  - [ ] Phone field
  - [ ] Submit to `/api/auth/register/google`
  - [ ] On validation error → show inline errors, preserve form + cookie
  - [ ] On success → `window.location.assign(destination)`
  - [ ] On expired cookie → redirect to `/login`
  - [ ] On network error → show toast, preserve form + cookie

### Phase 1 — Agent E (Testing)

- [ ] Unit tests for `google-auth.ts`
- [ ] Unit tests for new Zod validators
- [ ] Integration tests for `POST /api/auth/google` (7+ scenarios)
- [ ] Integration tests for `POST /api/auth/register/google` (6+ scenarios)
- [ ] Integration tests for `POST /api/auth/google/link` (4+ scenarios)
- [ ] Integration test for login route guard (3 scenarios: Google-only, dual-provider, local-only)
- [ ] Regression tests: login, registration, refresh, logout
- [ ] Feature flag tests: routes return 404 when disabled, button hidden
- [ ] Security tests: expired cookie, tampered cookie, replay, rate limit

---

## 15. Implementation Order Summary

| Order | Task | Agent | Depends On | Estimated Files |
|---|---|---|---|---|
| 1 | Schema + validators + packages + env vars | A | — | 4 modified |
| 2 | Google auth utility | B | A (package) | 1 new |
| 3 | API routes (google, register/google, link) | C | A (schema), B (utility) | 3 new, 1 modified |
| 4 | Login route guard | C | A (schema) | 1 modified |
| 5 | Frontend (login page + register page) | D | C (API routes) | 1 new, 1 modified |
| 6 | Testing | E | A, B, C, D | New test files |

**Total: 5 new files, 6 modified files (~20 lines of changes to existing code).**
