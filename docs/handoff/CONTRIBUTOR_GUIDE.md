# Contributor Guide

## Getting Started

### Prerequisites

- **Node.js** v20+ (check with `node --version`)
- **npm** v10+ (check with `npm --version`)
- **MySQL** 8.0+ (local or remote)
- **MinIO** (optional — falls back to local if not configured)
- **Git** (obviously)

### Local Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd coe-main

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.docker.example .env.local

# 4. Edit .env.local with your database credentials
#    Minimum required:
#    DATABASE_URL="mysql://user:***@localhost:3306/coe_main"
#    JWT_ACCESS_SECRET="any-random-string"
#    JWT_REFRESH_SECRET="any-different-random-string"
#    ADMIN_EMAIL="admin@tcetmumbai.in"
#    ADMIN_PASSWORD="AdminPassword123"
#    ADMIN_NAME="CoE Admin"

# 5. Run database migrations
npm run db:migrate

# 6. Seed admin account
curl -X POST http://localhost:3000/api/seed

# 7. Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Project Dashboard Setup

> The Project Dashboard is an **external application** (`project-dashboard/` is gitignored — it lives in its own repository). If you have a checkout, the setup is:

```bash
cd project-dashboard
npm install
cp .env.example .env
# Edit .env with database and COE_JWT_SECRET
npm run db:generate
npm run db:push
npm run dev
```

## Development Workflow

### Code Style

- **TypeScript** — Strict mode enabled. No `any` types in new code.
- **ESLint** — Run `npm run lint` before committing.
- **Formatting** — Prettier (config in root).
- **Naming**:
  - Files: `kebab-case.ts`
  - Functions: `camelCase()`
  - Types/Interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Database models: `PascalCase` (Prisma convention)

### Git Workflow

```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes, commit frequently
git add .
git commit -m "feat: add new feature"

# 3. Keep branch updated
git fetch origin
git rebase origin/main

# 4. Push and create PR
git push origin feat/my-feature
```

### Commit Messages

Follow conventional commits:

```
feat: add new feature
fix: fix bug in booking system
refactor: clean up auth code
docs: update API documentation
chore: update dependencies
test: add booking tests
```

## How to Add a New Feature

### 1. Database (if needed)

```prisma
// prisma/schema.prisma
model NewFeature {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  // Relations to existing models
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
}
```

```bash
npm run db:migrate:create -- --name add_new_feature
npm run db:migrate
```

### 2. API Route

```typescript
// src/app/api/new-feature/route.ts
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', [], 400);

    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const created = await prisma.newFeature.create({
      data: { name: parsed.data.name, userId: user.id },
    });

    return successRes(created, 'Created successfully.', 201);
  } catch (err) {
    console.error('Error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
```

### 3. Frontend Page

Create `src/app/new-feature/page.tsx` and call your API:

```typescript
const res = await fetch('/api/new-feature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'test' }),
  credentials: 'include',  // IMPORTANT: sends cookies!
});
```

## Common Patterns

### Pattern 1: Protected API Route

```typescript
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);
    
    const data = await prisma.model.findMany();
    return successRes(data);
  } catch (err) {
    return errorRes('Internal server error', [], 500);
  }
}
```

### Pattern 2: Zod Validation

```typescript
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18, 'Must be 18+'),
});

const parsed = schema.safeParse(body);
if (!parsed.success) {
  return errorRes('Validation failed', parsed.error.issues.map(e => e.message), 400);
}
// parsed.data is type-safe!
```

### Pattern 3: Email Dispatch

```typescript
import { dispatchEmail } from '@/lib/email-delivery';

await dispatchEmail({
  to: user.email,
  subject: 'Your booking is confirmed',
  html: '<p>Dear student...</p>',
  category: 'BOOKING_CONFIRMED',
  mode: 'immediate',
});
```

### Pattern 4: File Upload

```typescript
import { uploadFile } from '@/lib/minio';

const formData = await req.formData();
const file = formData.get('image') as File;
const objectKey = await uploadFile('news', {
  buffer: Buffer.from(await file.arrayBuffer()),
  originalname: file.name,
  mimetype: file.type,
  size: file.size,
});
// Serve: `/api/storage/${objectKey}` (public folders) — private folders
// (certificates/, tickets/, innovation submissions) require auth + ownership.
// NOTE: toProxyUrl() is private in minio.ts — do not import it.
```

## Testing

Currently there are no automated tests. To test manually:

1. Run the app locally
2. Trigger the feature
3. Check server logs (`console.log` output)
4. Check database (Prisma Studio: `npx prisma studio`)
5. Check MinIO console for file uploads

## Pull Request Checklist

Before creating a PR:

- [ ] Code compiles (`npm run build`)
- [ ] Linter passes (`npm run lint`)
- [ ] No `console.log` left in (except activity logging)
- [ ] No `any` types (unless absolutely necessary)
- [ ] Error handling covers all branches
- [ ] Zod validation for all user inputs
- [ ] `authenticate()` + `authorize()` for protected routes
- [ ] Response follows `{ success, message, data }` envelope
- [ ] Environment variables documented if new ones added
- [ ] Prisma migration created if schema changed
