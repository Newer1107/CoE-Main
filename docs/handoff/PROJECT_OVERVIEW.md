# TCET Centre of Excellence Portal — Project Overview

## What Is This?

This is a **production web application** for the **TCET Centre of Excellence (CoE)** — a department within Thakur College of Engineering & Technology, Mumbai.

The portal serves as a central hub for:

- **Students** to book facilities, participate in innovation challenges and hackathons, apply for internships, and manage their academic projects
- **Faculty** to publish content (news, events, grants), create and review innovation problems, judge hackathons, and manage student projects
- **Admins** to moderate everything — approve faculty, manage bookings, send broadcast emails, impersonate users, and view platform analytics
- **Industry Partners** to collaborate on internship programs and review student applications
- **Public visitors** to browse the homepage, innovation landing pages, and published showcase projects

## Two Applications, One Login

This repository contains the **CoE Portal** — a Next.js application. It shares authentication with a **second, separate application** — the **Project Dashboard**:

> **Important**: the Project Dashboard lives in `project-dashboard/`, which is **gitignored and not part of this repository's source tree** (it is maintained as its own project/repository). The diagram below describes the integration contract for context; dashboard internals are documented here for historical reference only.

```
┌─────────────────────────────────────────────────────────┐
│                  CoE Portal (Main App)                   │
│  Location: ./src/                                        │
│  Domain: tcetcercd.in                                    │
│  Database: MySQL (Prisma ORM)                            │
│                                                        │
│  Features:                                              │
│  - Authentication (email/password + Google Sign-In)     │
│  - Facility Booking + PDF Tickets                       │
│  - Content Management (news, events, grants)            │
│  - Innovation Platform (hackathons + certificates)      │
│  - Public Hackathon Vertical (/hackathons/*)            │
│  - Internship Management                                │
│  - Admin Panel (incl. hackathon content/config)         │
│  - Project Hosting Requests                             │
└─────────────────────────────────────────────────────────┘
                        │
            Shared JWT Cookie (coe_shared_token)
            Domain: .tcetcercd.in
                        │
┌─────────────────────────────────────────────────────────┐
│              Project Dashboard (Supporting App)          │
│  Location: ./project-dashboard/  [EXTERNAL — gitignored] │
│  Domain: project-dashboard.tcetcercd.in                  │
│  Database: Separate MySQL (separate Prisma schema)       │
│                                                        │
│  Features:                                              │
│  - Academic Project Monitoring                           │
│  - Showcase Publishing System                           │
│  - Student Task/Milestone Management                    │
│  - CSV Assignment Import                                │
│  - Email Outbox with Bounce Detection                   │
│  - Admin Project Control                                │
└─────────────────────────────────────────────────────────┘
```

## Why Two Applications?

The CoE portal handles **authentication, content, bookings, and innovation**. The Project Dashboard handles **academic project workflows**. They are separate because:

1. They serve different user needs (portal vs project management)
2. They have independent databases and deployment cycles
3. They are maintained by different teams
4. They share authentication via a cross-domain JWT cookie so users don't log in twice

The dashboard's code is **not in this repository** (`project-dashboard/` is gitignored) — the CoE portal only talks to it over HTTP (`DASHBOARD_URL` + `SYNC_SECRET`) and issues the shared cookie.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19 + Tailwind CSS v4 |
| **Database** | MySQL + Prisma ORM |
| **Auth** | JWT (jsonwebtoken), Google OAuth 2.0 (google-auth-library) |
| **Validation** | Zod |
| **Email** | Nodemailer + OAuth2 SMTP |
| **File Storage** | MinIO (S3-compatible object storage) |
| **Analytics** | Google Analytics 4 |
| **PDF** | pdf-lib (for ticket generation) |
| **QR Codes** | qrcode library |

## Who Uses This?

| Role | What They Can Do |
|------|-----------------|
| **Public** | View homepage, innovation landing pages, event details, published showcase projects |
| **Student** | Register, login, book facilities, participate in innovation/hackathons, manage projects |
| **Faculty** | Login, publish content, create innovation problems, judge hackathons, review applications |
| **Admin** | Full access — approve faculty, moderate bookings, manage users, send emails, impersonate users |
| **Industry Partner** | Review internship applications, collaborate on problem statements |

## Key Technical Decisions

| Decision | Why |
|----------|-----|
| **JWT in httpOnly cookies** | Prevents XSS attacks from stealing tokens (JavaScript cannot read httpOnly cookies) |
| **bcrypt with 12 rounds** | Makes password cracking prohibitively slow for attackers |
| **Three separate JWT tokens** | Access token (8h), refresh token (7d), shared cross-domain token (7d) — each with different security boundaries |
| **Zod for validation** | Type-safe runtime validation that integrates with TypeScript types |
| **Prisma ORM** | Type-safe database queries with auto-generated TypeScript types |
| **MinIO for storage** | S3-compatible, self-hosted, no cloud dependency for file storage |
| **Database-backed email queue** | Reliable email delivery with retry logic, survives server restarts |
| **Fire-and-forget dashboard sync** | User provisioning to dashboard happens asynchronously, never blocks the auth flow |

## Project Structure

```
coe-main/
├── src/                          # Main CoE Portal application
│   ├── app/                      # Next.js App Router pages and APIs
│   │   ├── api/                  # Backend API route handlers
│   │   │   ├── auth/             # Authentication endpoints
│   │   │   ├── admin/            # Admin endpoints
│   │   │   ├── bookings/         # Booking endpoints
│   │   │   ├── innovation/       # Innovation endpoints
│   │   │   ├── cron/             # Background job endpoints
│   │   │   └── ...               # Other API groups
│   │   ├── login/                # Login page
│   │   ├── admin/                # Admin panel pages
│   │   ├── facility-booking/     # Booking pages
│   │   ├── innovation/           # Innovation pages
│   │   └── ...                   # Other pages
│   └── lib/                      # Shared libraries
│       ├── jwt.ts                # JWT token management
│       ├── api-helpers.ts        # authenticate() + authorize()
│       ├── validators.ts         # Zod schemas
│       ├── email-delivery.ts     # Email queue system
│       ├── mailer.ts             # Email templates
│       ├── minio.ts              # File storage
│       ├── hackathon-scoring.ts  # Scoring engine
│       └── ...                   # Other utilities
├── project-dashboard/            # EXTERNAL Project Dashboard app (gitignored — not in this repo)
└── docs/                         # Documentation
```

## Navigation

The site navbar (`src/components/Navbar.tsx`) is a single responsive component:

- Desktop links render above the **`1270px` breakpoint** (`min-[1270px]:flex`); below it the hamburger menu takes over (`min-[1270px]:hidden`).
- The **Programs** dropdown groups the hackathon vertical + innovation-program links (`/hackathons/browse`, `/hackathons/external`, `/hackathons/learn`, `/hackathons/my`, `/hackathons/portfolio`, `/hackathons/dashboard`, `/hackathons/portal`, plus innovation programs).

## Next Steps

If you are new to this project:

1. Start with **SYSTEM_ARCHITECTURE.md** to understand the big picture
2. Read **CODEBASE_READING_GUIDE.md** for a structured learning path
3. Read **AUTHENTICATION.md** (the most critical subsystem)
4. Pick a module that interests you and dive into its documentation

All documentation is in the `docs/handoff/` directory.
