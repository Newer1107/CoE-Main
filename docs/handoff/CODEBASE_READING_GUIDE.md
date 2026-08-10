# Codebase Reading Guide

## For Second-Year Engineering Students

You know C, DSA, basic Java, and basic programming. You have **never** worked on a production web application. This guide will take you from zero to productive contributor.

---

## Before You Start: Mindset

A production web application is NOT like your C programming assignments.

**In C:**
- You write a program, compile it, run it
- The program starts at `main()`, does something, and exits
- All code is in a few `.c` files

**In this project:**
- The application never stops running (it's a server)
- Code is split across hundreds of files in nested folders
- Multiple programs (browser frontend + Node.js backend + MySQL database + MinIO storage) work together
- The "entry point" is not one function — it's URLs

**Think of it like a restaurant:**
- The **menu** is the list of API endpoints
- The **kitchen** is the Next.js server
- The **pantry** is the MySQL database
- The **waiters** are the API route handlers (they take requests and bring back responses)
- The **chefs** are the service functions (they do the actual work)
- The **manager** is the authentication system (checks IDs before letting anyone into the kitchen)

---

## Week 1: Web Fundamentals

### Day 1-2: Understand the Stack

Read these to understand what each technology does:

| Technology | What It Does | Read This |
|-----------|-------------|-----------|
| **HTTP** | How browsers talk to servers | MDN: "How HTTP Works" (5 min) |
| **JSON** | How data is formatted in APIs | MDN: "JSON" (5 min) |
| **Next.js** | Framework that handles both frontend + backend | Next.js docs: "What is Next.js" (10 min) |
| **API Routes** | How Next.js handles backend requests | Next.js docs: "Route Handlers" (10 min) |
| **Prisma** | How we talk to the database | Prisma docs: "What is Prisma" (5 min) |
| **JWT** | How authentication works | jwt.io "Introduction" (10 min) |

### Day 3: Explore the Project Structure

```bash
# In the project root, run:
ls src/app/          # See all pages
ls src/app/api/      # See all API routes
ls src/lib/          # See all shared libraries
ls prisma/           # See the database schema
```

**Exercise:** Open each directory and read 2-3 files. Don't understand everything — just get a feel for the patterns.

### Day 4-5: Follow One Complete Request

Pick a simple feature — for example, fetching news articles (no authentication required).

1. **Frontend**: Find `src/app/page.tsx` (the homepage)
2. **API**: Find `src/app/api/news/route.ts` (the news API)
3. **Database**: Find the `NewsPost` model in `prisma/schema.prisma`
4. **Service**: See if `src/lib/` has any news-related utilities

Trace how data flows: Page → API → Prisma → MySQL → Response → Page

---

## Week 2: Authentication

### Day 6-7: Core Auth Files

Read these in order:

1. `prisma/schema.prisma` — Look at the `User` and `Otp` models. Understand what fields a user has.
2. `src/lib/jwt.ts` — The heart of auth. Understand the three token types.
3. `src/lib/api-helpers.ts` — Understand `authenticate()` and `authorize()`.

**Key insight**: Every protected API route follows this pattern:

```typescript
// 1. Who are you?
const user = authenticate(req);
if (!user) return errorRes('Unauthorized', [], 401);

// 2. Are you allowed?
if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

// 3. Do the work
const data = await prisma.user.findMany();

// 4. Respond
return successRes(data);
```

### Day 8-9: Login Flow

Read:

4. `src/app/api/auth/login/route.ts` — The login API
5. `src/app/login/page.tsx` — The login page
6. `src/app/api/auth/register/student/route.ts` — Student registration

**Exercise**: Write down every step that happens when a user logs in, from button click to dashboard redirect.

### Day 10: OTP Verification

Read:

7. `src/app/api/auth/verify-otp/route.ts` — OTP verify + auto-login
8. `src/app/api/auth/register/faculty/route.ts` — Faculty registration

---

## Week 3: Major Features

### Day 11-12: Facility Booking

Read:

1. `src/app/api/bookings/route.ts` — Create a booking
2. `src/app/facility-booking/page.tsx` — The booking page
3. `src/app/api/cron/reminder/route.ts` — Booking reminder cron

**Exercise**: Map the booking lifecycle: PENDING → CONFIRMED/REJECTED/CANCELLED

### Day 13-15: Innovation Platform

This is the largest module. Read:

1. `prisma/schema.prisma` — All innovation models (Problem, Claim, HackathonEvent, Certificate, Application, etc.)
2. `src/lib/hackathon-scoring.ts` — The scoring system
3. `src/app/api/innovation/events/route.ts` — Hackathon events
4. `src/app/api/innovation/applications/route.ts` — Applications (used for internship selection)

**Tip**: Don't try to understand everything. Focus on one workflow:
- Either: Internships (create → apply → bulk-select → workspace)
- Or: Hackathons (create → register → screening → judging → results → certificates)

> Note: the old "open problems" registration flow is archived — `POST /api/innovation/claims` returns a pointer to `/api/innovation/open-submissions`.

---

## Week 4: Advanced Topics

### Day 16-17: Email System

1. `src/lib/email-delivery.ts` — The queue-based email system
2. `src/lib/mailer.ts` — Email templates
3. `src/app/api/cron/email-queue/route.ts` — The email queue worker

### Day 18: Storage

1. `src/lib/minio.ts` — File storage client
2. `src/app/api/storage/[...path]/route.ts` — Storage proxy

### Day 19: Hackathon Vertical + External Apps

1. `src/app/hackathons/` — Public hackathon vertical (browse, external, learn, my, portfolio, dashboard, portal)
2. `src/app/api/learning-resources/route.ts` — Learning resources API
3. `src/lib/dashboard-sync.ts` — CoE → Project Dashboard sync (the dashboard itself is an **external gitignored app**)

### Day 20: Review

1. Read through all the documentation in `docs/handoff/`
2. Pick a module that interests you
3. Try to trace one complete feature end-to-end

---

## Week 5: First Contribution

### Day 21-22: Debug

Pick a module and:
1. Read the documentation
2. Read the API routes
3. Read the frontend pages
4. Run the app locally
5. Trigger the feature and watch the server logs

### Day 23-24: Small Change

Make a tiny change:
- Add a new field to an existing API response
- Add a new validation rule
- Create a new email template
- Add a new filter to the admin user list

### Day 25: Commit

Learn the git workflow:
```bash
git checkout -b my-feature
# make changes
git add .
git commit -m "feat: description of change"
```

---

## File Reading Strategy

### When Reading a New File, Ask:

1. **Where is this file?** (API route? Library? Page?)
2. **What does it export?** (Functions? Types? Constants?)
3. **What does it import?** (What other modules does it depend on?)
4. **When is it called?** (By what? A browser request? Another function?)
5. **What is its single responsibility?** (One file = one job)

### Understand the Directory Naming

```
src/app/api/auth/login/route.ts
│    │    │    │       │
│    │    │    │       └── Next.js Route Handler file
│    │    │    └────────── API endpoint name (POST /api/auth/login)
│    │    └─────────────── API group (authentication)
│    └──────────────────── All API routes live here
└───────────────────────── App Router base
```

### Pattern Recognition

You'll see these patterns everywhere:

**API Route Pattern:**
```typescript
export async function GET/POST/PATCH/DELETE(req: NextRequest) {
  try {
    // 1. Parse body (for POST/PATCH)
    // 2. Validate with Zod
    // 3. Authenticate
    // 4. Authorize
    // 5. Business logic
    // 6. Return successRes()
  } catch (err) {
    return errorRes('message', [], 500);
  }
}
```

**Response Envelope Pattern:**
```typescript
// Success: { success: true, message: "...", data: {...} }
// Error:   { success: false, message: "...", data: null, errors: [...] }
```

---

## Common Pitfalls for Beginners

| Pitfall | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| **Editing the wrong file** | Similar names in `src/app/` and `src/app/api/` | Always check the full path |
| **Forgetting `await`** | Prisma queries are async | TypeScript will warn you |
| **Not handling errors** | Focus on the "happy path" | Always wrap in try/catch |
| **Hardcoding URLs** | Copy-pasting from examples | Use environment variables |
| **Forgetting cookies** | API calls from frontend need `credentials: "include"` | Always add this to fetch calls |
| **Not checking types** | Prisma generates TypeScript types — use them | Don't use `any` |
| **Skipping validation** | Trusting user input | Always use Zod schemas |

---

## Quick Reference

**To find where something is defined:**
```bash
# Search for a function name
grep -r "functionName" src/

# Find all files mentioning a term
grep -r "searchTerm" src/ --include="*.ts"

# List all API routes
ls src/app/api/**/route.ts

# List all database models
grep "model " prisma/schema.prisma
```

**To understand a Prisma query:**
```bash
# Search for Prisma calls
grep -r "prisma\." src/app/api/
```

**To trace an API endpoint:**
1. Find the route file: `src/app/api/<group>/<endpoint>/route.ts`
2. Check imports for library functions
3. Check the Prisma schema for model/fields
4. Check the frontend page that calls it
