# Google Sign-In — Implementation Summary

## Overview

Google Sign-In implemented as an extension of the existing custom JWT + httpOnly cookie + RBAC auth system. No auth framework introduced — uses `google-auth-library` for server-side token verification and `@react-oauth/google` for the frontend button.

## Architecture

```
User clicks Google button
  → @react-oauth/google popup → credential (ID token)
  → POST /api/auth/google { credential }
  → verifyGoogleToken() via google-auth-library
  → DB lookup: googleId → email → determine action
  → Response: { action: "login" | "register" | "link_prompt" | ... }
```

## Files Created (5)

| File | Purpose |
|---|---|
| `src/lib/google-auth.ts` | `verifyGoogleToken(credential)` — verifies Google ID token, returns `{ sub, email, name, email_verified }` |
| `src/app/api/auth/google/route.ts` | OAuth entry point — accepts credential, determines action (login/register/link_prompt/pending/rejected/invalid_domain), issues `pending_reg` cookie for new users |
| `src/app/api/auth/register/google/route.ts` | Registration completion — reads `pending_reg` cookie, validates form, creates user via Prisma transaction, issues JWT + 3 cookies, fire-and-forget dashboard sync |
| `src/app/api/auth/google/link/route.ts` | Account linking — verifies Google token, finds user by email, sets `googleId`, issues login tokens |
| `src/app/register/complete/page.tsx` | Registration form — email (read-only), name (prefilled), UID, phone. Handles validation errors, expired sessions, race conditions |

## Files Modified (6)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `+googleId String? @unique` on User model + `@@index([googleId])` |
| `src/lib/validators.ts` | `+googleAuthSchema` (credential string), `+googleRegistrationSchema` (name, uid, phone) |
| `src/app/api/auth/login/route.ts` | +4 lines: after `bcrypt.compare` fails, check `user.googleId` → return `GOOGLE_ACCOUNT_ONLY` |
| `src/app/login/page.tsx` | Google Sign-In button (inside login form), `GoogleOAuthProvider` wrapper, credential handler switching on `data.action`, link prompt modal |
| `.env.docker.example` | +5 Google env vars (lines 47–51: `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_REGISTRATION_SECRET`, `GOOGLE_SIGNIN_ENABLED`, `ALLOWED_EMAIL_DOMAIN`) |

> Note: a standalone `.env.example` is not present in the repo — `.env.docker.example` is the reference env template.

## Dependencies Added (2)

- `google-auth-library` — server-side ID token verification
- `@react-oauth/google` — frontend Google Sign-In button

## Database

- `User.googleId` (`String? @unique`) — maps Google account to user. Nullable (local users don't have one)
- `password` field unchanged (`String`, required) — Google users get `crypto.randomBytes(32)` → `bcrypt.hash(12)` random password (Option B from spec)
- Migration: `prisma/migrations/20260701125758_google` (already created and applied; deployed via `npm run db:migrate` on production)

## Environment Variables (5)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | — | Server-side token audience verification |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | — | Frontend OAuth provider init |
| `GOOGLE_REGISTRATION_SECRET` | Yes | — | Signs `pending_reg` JWT (different secret from auth tokens) |
| `GOOGLE_SIGNIN_ENABLED` | No | `false` | Feature flag — when false, all endpoints return 404, button hidden |
| `ALLOWED_EMAIL_DOMAIN` | No | `tcetmumbai.in` | Restricts Google sign-ups to institutional domain |

## Response Actions

| Action | Condition | Frontend Behavior |
|---|---|---|
| `login` | googleId exists + status = ACTIVE | `window.location.assign(destination)` |
| `register` | New email, not in DB | Redirect to `/register/complete` |
| `link_prompt` | Email exists + no googleId yet | Show confirmation dialog → `POST /api/auth/google/link` |
| `pending` | Email exists + status = PENDING | Show "awaiting admin approval" message |
| `rejected` | Email exists + status = REJECTED | Show "registration rejected" message |
| `invalid_domain` | Email domain mismatch | Show domain requirement message |

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `GOOGLE_FEATURE_DISABLED` | 404 | Feature flag is false |
| `GOOGLE_TOKEN_INVALID` | 401 | Invalid/expired Google credential |
| `GOOGLE_EMAIL_NOT_VERIFIED` | 403 | Google hasn't verified this email |
| `GOOGLE_DOMAIN_INVALID` | 403 | Email domain doesn't match allowed domain |
| `GOOGLE_ACCOUNT_PENDING` | 403 | Faculty account awaiting approval |
| `GOOGLE_ACCOUNT_REJECTED` | 403 | Faculty account was rejected |
| `GOOGLE_ACCOUNT_ONLY` | 400 | Google user attempted email/password login |
| `GOOGLE_REGISTRATION_MISSING` | 401 | No `pending_reg` cookie |
| `GOOGLE_REGISTRATION_EXPIRED` | 401 | `pending_reg` cookie expired (>15 min) |
| `GOOGLE_REGISTRATION_INVALID` | 401 | `pending_reg` cookie tampered |
| `EMAIL_EXISTS` | 409 | Email taken during registration window |
| `UID_EXISTS` | 409 | UID already registered |
| `GOOGLE_ALREADY_LINKED` | 409 | Google account already linked to different user |
| `RATE_LIMITED` | 429 | Rate limit exceeded |

## Security

- All Google token verification happens server-side via `google-auth-library` (aud, iss, exp, signature)
- `pending_reg` JWT uses dedicated `GOOGLE_REGISTRATION_SECRET` (separate from auth token secrets)
- Registration uses Prisma transaction for atomic uniqueness checks (email, uid, googleId)
- Concurrent unique constraint violations (P2002) caught and mapped to proper 409 errors
- Account linking route enforces status checks (PENDING/REJECTED blocked) before issuing tokens
- Rate limiting: 30 req/min/IP for google endpoint, 10 req/min/IP for register/link
- Feature flag makes all endpoints completely inert when disabled
- Dashboard sync is fire-and-forget, never blocks login response

## Key Design Decisions

| Decision | Chosen | Rationale |
|---|---|---|
| Password for Google users | Random 32-byte hex → bcrypt hash | No schema migration, no null checks, forgot/reset works unchanged |
| Auth library | `google-auth-library` (not NextAuth/Passport) | Does exactly one thing needed, zero framework lock-in |
| `pending_reg` secret | Dedicated `GOOGLE_REGISTRATION_SECRET` | Pre-auth vs post-auth boundary, independent rotation |
| `action` in response | Inside `data` object (not top-level) | `api-helpers.ts` cannot be modified; frontend reads `data.action` |
| Replay protection | Short TTL (15 min) + unique constraints + cookie clearing on success | No in-memory jti tracking (breaks in multi-instance) |

## Deploy Steps

```bash
# 1. Generate Prisma client
npx prisma generate

# 2. Apply the migration (20260701125758_google is already in the repo)
npm run db:migrate        # runs scripts/prisma-safe-migrate.mjs apply

# 3. Build & restart
npm run build
pm2 restart coe-main   # or equivalent

# 4. Set env vars and restart
# GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_CLIENT_ID, GOOGLE_REGISTRATION_SECRET, GOOGLE_SIGNIN_ENABLED=true
# (ALLOWED_EMAIL_DOMAIN defaults to tcetmumbai.in)
```
