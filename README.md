# TCET Center of Excellence Portal

Production-ready Next.js portal for TCET CoE operations, including:
- cookie-based authentication
- role-based access control (Admin, Faculty, Student)
- facility booking with approval workflow
- content management for news, events, grants, announcements
- email notifications and reminder cron jobs

## 1. What This Project Includes

### Role capabilities

- Student:
  - register with OTP verification
  - login and submit facility bookings
  - view own bookings
- Faculty:
  - login to faculty portal
  - create and view News, Events, Grants, Announcements
- Admin:
  - login to admin dashboard
  - approve/reject faculty registrations
  - review pending bookings
  - view upcoming confirmed bookings for operational readiness

### Resource booking context

Configured booking rooms:
- Research Culture Development Room 701
- Industrial IoT and OT Room 213
- Robotics and Automation Room 010

## 2. Tech Stack

- Framework: Next.js 16 (App Router)
- Language: TypeScript
- UI: React 19, Tailwind CSS v4
- Database: MySQL with Prisma
- Auth: JWT access/refresh with httpOnly cookies
- Email: Nodemailer (SMTP)
- Object storage: MinIO (S3-compatible)
- Validation: Zod
- Scheduling: cron endpoint at /api/cron/reminder

## 3. Architecture

### High-level architecture

```mermaid
flowchart TD
  U[Browser] --> P[Next.js App Router]
  P --> WEB[Pages and Server Components]
  P --> API[Route Handlers /api/*]
  API --> AUTH[Auth Layer: JWT + Cookies + RBAC]
  API --> DB[(MySQL via Prisma)]
  API --> MAIL[SMTP Mailer]
  API --> OBJ[MinIO Object Storage]
  CRON[Scheduler] --> REM["/api/cron/reminder"]
  REM --> API
```

### Authentication and session flow

```mermaid
sequenceDiagram
  participant Client
  participant LoginAPI as POST /api/auth/login
  participant Browser as Browser Cookie Store
  participant ProtectedAPI as Protected /api routes
  participant RefreshAPI as POST /api/auth/refresh

  Client->>LoginAPI: email + password
  LoginAPI-->>Browser: Set-Cookie(accessToken, refreshToken)
  Client->>ProtectedAPI: request with cookies
  ProtectedAPI->>ProtectedAPI: authenticate() + authorize()
  ProtectedAPI-->>Client: data or 401/403
  Client->>RefreshAPI: refresh request
  RefreshAPI-->>Browser: Set-Cookie(new accessToken)
```

### Booking approval flow

```mermaid
flowchart LR
  S[Student] --> B[POST /api/bookings]
  B --> A1[Admin pending queue]
  A1 --> C[PATCH /api/admin/bookings/:id/confirm]
  A1 --> R[PATCH /api/admin/bookings/:id/reject]
  C --> U1[Upcoming confirmed bookings visible in admin panel]
  C --> M1[Confirmation email]
  R --> M2[Rejection email]
  CRON[GET /api/cron/reminder] --> M3[30-min reminder email]
```

## 4. Project Structure

```text
.
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dynamic home page (news/events/grants/announcements)
│   │   ├── login/                   # Login + OTP verification UX
│   │   ├── facility-booking/        # Student booking flow
│   │   ├── faculty/                 # Faculty content portal
│   │   ├── admin/                   # Admin control panel
│   │   └── api/                     # Route handlers
│   │       ├── auth/
│   │       ├── bookings/
│   │       ├── admin/
│   │       ├── news/
│   │       ├── events/
│   │       ├── grants/
│   │       ├── announcements/
│   │       ├── cron/reminder/
│   │       ├── health/
│   │       └── seed/
│   ├── components/
│   └── lib/                         # prisma, jwt, validators, minio, mailer, api-helpers
├── prisma.config.ts
├── package.json
└── README.md
```

## 5. Environment Variables

Create .env in the repository root:

```env
DATABASE_URL="mysql://root:password@localhost:3306/coe_db"
JWT_ACCESS_SECRET="your_access_secret"
JWT_REFRESH_SECRET="your_refresh_secret"

ADMIN_EMAIL="admin@tcetmumbai.in"
ADMIN_PASSWORD="AdminPassword123"
ADMIN_NAME="CoE Admin"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="app-specific-password"

MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
```

Optional variables used in code paths:
- MINIO_USE_SSL=true|false
- MINIO_BUCKET=coe-assets
- NEXT_PUBLIC_APP_URL=http://localhost:3000
- SMTP_FROM="TCET CoE <noreply@tcetmumbai.in>"

## 6. Local Development Setup

### Prerequisites

- Node.js 20+
- MySQL running and reachable via DATABASE_URL
- MinIO running locally or remotely
- SMTP credentials (or a dev SMTP sandbox)

### Install and run

```bash
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

App URL:
- http://localhost:3000

### Seed admin account

Use POST only:

```bash
curl -X POST http://localhost:3000/api/seed
```

## 7. Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build + type check
npm run start    # Start production server
npm run lint     # Run ESLint
```

## 8. Route Map

### Pages

- /                     Home (dynamic)
- /about                About
- /login                Login
- /facility-booking     Student booking flow
- /faculty              Faculty portal (auth protected)
- /admin                Admin panel (auth + role protected)
- /laboratory           Laboratory page

### API: Auth

- POST /api/auth/register/student
- POST /api/auth/register/faculty
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh
- POST /api/auth/verify-otp
- POST /api/auth/resend-otp

### API: Bookings

- POST /api/bookings
- GET /api/bookings/my
- DELETE /api/bookings/[id]
- GET /api/bookings (returns guidance message)

### API: Admin

- GET /api/admin/stats
- GET /api/admin/users
- GET /api/admin/bookings
- PATCH /api/admin/bookings/[id]/confirm
- PATCH /api/admin/bookings/[id]/reject
- PATCH /api/admin/faculty/[id]/approve
- PATCH /api/admin/faculty/[id]/reject

### API: Content

- GET /api/news
- POST /api/news
- PATCH /api/news/[id]
- DELETE /api/news/[id]

- GET /api/events
- POST /api/events
- PATCH /api/events/[id]
- DELETE /api/events/[id]

- GET /api/grants
- POST /api/grants
- PATCH /api/grants/[id]
- DELETE /api/grants/[id]

- GET /api/announcements
- POST /api/announcements
- DELETE /api/announcements/[id]

### API: Utility

- GET /api/health
- POST /api/seed
- GET /api/cron/reminder

## 9. Request Payload Guide

### POST /api/news (multipart/form-data)

Fields:
- title (string)
- caption (string)
- image (file: jpeg/png/webp)

### POST /api/events (multipart/form-data)

Fields:
- title (string)
- description (string)
- date (ISO-compatible date string)
- mode (ONLINE | OFFLINE | HYBRID)
- registrationLink (optional URL)
- poster (optional image file)

### POST /api/grants (multipart/form-data)

Fields:
- title (string)
- issuingBody (string)
- category (GOVT_GRANT | SCHOLARSHIP | RESEARCH_FUND | INDUSTRY_GRANT)
- description (string)
- deadline (date string)
- referenceLink (optional URL)
- attachment (optional PDF)

### POST /api/announcements (application/json)

```json
{
  "text": "Lab 701 access timing updated",
  "link": "https://example.com/circular",
  "expiresAt": "2026-04-30T23:59:59.000Z"
}
```

## 10. Security and Access Control

- Access token and refresh token are set as httpOnly cookies.
- API authentication supports:
  - Authorization: Bearer <token>
  - accessToken cookie fallback
- Authorization is role-based in route handlers.
- Student registration requires OTP verification.
- Faculty registration requires admin approval.

## 11. Operational Notes

- Reminder endpoint checks confirmed bookings in the next 30 minutes and sends emails.
- Same cron endpoint also cleans up expired OTP records.
- Home page is data-driven using live database content.

## 12. Troubleshooting

- GET /api/seed returns 405:
  - expected behavior, only POST is implemented.
- /seed returns 404:
  - expected behavior, no page route exists for /seed.
- Prisma config type error for prisma/config during build:
  - this project uses a plain exported object in prisma.config.ts to avoid that dependency mismatch.

## 13. Contribution Checklist

Before opening a PR:

- npm run lint
- npm run build
- verify login, faculty portal, and admin workflow manually
- ensure .env secrets are not committed
