# Content Management System

## Overview

The Content Management System handles the public-facing content on the CoE Portal: news articles, events, grants, announcements, and hero slides.

## Why This Module Exists

The CoE needs to communicate with students and faculty about:
- **News**: Latest achievements, workshops, updates
- **Events**: Upcoming seminars, webinars, conferences
- **Grants**: Research funding opportunities, scholarships
- **Announcements**: Time-sensitive notices (expiring)
- **Hero Slides**: Featured content on the homepage carousel

## Files

| File | Purpose |
|------|---------|
| `src/app/api/news/route.ts` | List and create news |
| `src/app/api/news/[id]/route.ts` | Update and delete news |
| `src/app/api/events/route.ts` | List and create events |
| `src/app/api/events/[id]/route.ts` | Update and delete events |
| `src/app/api/grants/route.ts` | List and create grants |
| `src/app/api/grants/[id]/route.ts` | Update and delete grants |
| `src/app/api/announcements/route.ts` | List and create announcements |
| `src/app/api/announcements/[id]/route.ts` | Delete announcement |
| `src/app/api/hero-slides/route.ts` | List and create hero slides |

## Access Control

| Content Type | Read | Create | Update | Delete |
|-------------|------|--------|--------|--------|
| **News** | Public | Faculty/Admin | Faculty/Admin | Admin |
| **Events** | Public | Faculty/Admin | Faculty/Admin | Faculty/Admin |
| **Grants** | Public | Faculty/Admin | Faculty/Admin | Admin |
| **Announcements** | Public | Faculty/Admin | — | Faculty/Admin |
| **Hero Slides** | Public | Admin | — | — |

## Content Serving

All content list endpoints support the homepage layout:

```
GET /api/news     → JSON array of news items with image URLs
GET /api/events   → JSON array of upcoming events
GET /api/grants   → JSON array of active grants
GET /api/announcements → JSON array of non-expired announcements
GET /api/hero-slides  → JSON array of active hero slides
```

Content is rendered server-side on the homepage (`src/app/page.tsx`). The API is also used by admin/faculty UIs for CRUD operations.

## Pagination

Content APIs support cursor-based pagination through Next.js:

```typescript
const news = await prisma.newsPost.findMany({
  orderBy: { publishedAt: 'desc' },
  take: 10,
});
```

## Image Upload

Content items with images (news, events, hero slides) use file upload through MinIO. The client sends the raw file; the route converts it to a Buffer and calls `uploadFile(folder, { buffer, originalname, mimetype, size })`:

```typescript
// In the POST handler:
const formData = await req.formData();
const file = formData.get('image') as File;
const objectKey = await uploadFile('news', {
  buffer: Buffer.from(await file.arrayBuffer()),
  originalname: file.name,
  mimetype: file.type,
  size: file.size,
});

// Store the key, not the full URL
await prisma.newsPost.create({
  data: { imageKey: objectKey, title, caption }
});
```

Images are served via the `/api/storage/[...path]` proxy (`news/`, `events/`, `grants/`, `hero-slides/` are public path patterns; everything else requires auth).

## Database Models

### NewsPost (`news_posts`)

```prisma
model NewsPost {
  id          Int      @id @default(autoincrement())
  title       String
  caption     String   @db.Text
  imageKey    String
  postedById  Int
  postedBy    User     @relation(fields: [postedById], references: [id])
  publishedAt DateTime @default(now())
  isVisible   Boolean  @default(true)
}
```

### Event (`events`)

```prisma
model Event {
  id               Int       @id @default(autoincrement())
  title            String
  description      String    @db.Text
  date             DateTime
  mode             EventMode  // ONLINE, OFFLINE, HYBRID
  registrationLink String?
  posterKey        String?
  postedById       Int
  postedBy         User
  isVisible        Boolean   @default(true)
  createdAt        DateTime  @default(now())
}
```

### Grant (`grants`)

```prisma
model Grant {
  id            Int           @id @default(autoincrement())
  title         String
  issuingBody   String
  category      GrantCategory  // GOVT_GRANT, SCHOLARSHIP, RESEARCH_FUND, INDUSTRY_GRANT
  description   String        @db.Text
  deadline      DateTime
  referenceLink String?
  attachmentKey String?
  postedById    Int
  postedBy      User
  isActive      Boolean       @default(true)
}
```

### Announcement (`announcements`)

```prisma
model Announcement {
  id          Int      @id @default(autoincrement())
  text        String   @db.Text
  link        String?
  expiresAt   DateTime
  createdById Int
  createdBy   User
  createdAt   DateTime @default(now())
}
```

### HeroSlide (`hero_slides`)

```prisma
model HeroSlide {
  id        Int      @id @default(autoincrement())
  title     String
  caption   String   @db.Text
  imageKey  String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Common Bugs

### 1. Image Upload Fails Silently

**Problem**: News created without an image because the upload failed but the try/catch caught it.

**Fix**: The upload happens inside a try/catch. Check `console.error` logs for MinIO errors.

### 2. Announcement Never Expires

**Problem**: Old announcements keep showing because `expiresAt` is in the future or null.

**Fix**: The GET handler filters `where: { expiresAt: { gte: new Date() } }`. Always set a reasonable expiry.

### 3. Faculty Can Delete Admin Content

**Problem**: Faculty can delete any event, not just their own.

**Fix**: The DELETE handler only checks `authorize(user, 'FACULTY', 'ADMIN')` — it doesn't check ownership. For admin-only deletion (news, grants), use `authorize(user, 'ADMIN')`.

## Exercises

1. **Add a new content type**: Create model, API routes, and frontend display
2. **Add ownership checks**: Restrict update/delete to the creator
3. **Add image alt text**: Add an `alt` field to NewsPost and display it
4. **Add pagination**: Implement cursor-based pagination for news

## Summary

The Content Management System is a straightforward CRUD module for public-facing content. It demonstrates the standard patterns: Zod validation, MinIO uploads, authenticate/authorize, and JSON responses. It's an excellent module for beginners to study because it's simple but touches all the major systems.
