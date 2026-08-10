# System Architecture

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        BROWSER["Browser / Web Client"]
    end

    subgraph "CoE Portal (tcetcercd.in)"
        NEXT["Next.js App Server"]
        
        subgraph "Pages"
            PUBLIC["Public Pages<br/>Home, About, Innovation"]
            AUTH_PAGES["Auth Pages<br/>Login, Forgot Password"]
            PROTECTED["Protected Pages<br/>Booking, Admin, Faculty"]
        end

        subgraph "API Layer"
            AUTH_API["/api/auth/*"]
            BOOK_API["/api/bookings/*"]
            ADMIN_API["/api/admin/*"]
            INNOV_API["/api/innovation/*"]
            CONTENT_API["/api/news, events, grants"]
            CRON_API["/api/cron/*"]
            STORAGE_API["/api/storage/*"]
        end

        subgraph "Service Layer"
            JWT["JWT Service"]
            AUTH_SVC["Authentication + RBAC"]
            MAILER["Email Dispatcher"]
            STORAGE_SVC["MinIO Storage"]
            SCORING["Scoring Engine"]
        end

        subgraph "Data Layer"
            PRISMA["Prisma ORM"]
            DB[(MySQL Database)]
        end
    end

    subgraph "External"
        MINIO["MinIO Object Store"]
        SMTP["SMTP Server (Gmail)"]
        GOOGLE["Google OAuth 2.0"]
        GA["Google Analytics 4"]
    end

    subgraph "Project Dashboard [EXTERNAL — gitignored, separate repo]"
        DASH_NEXT["Next.js App Server"]
        DASH_MW["Middleware<br/>(shared auth)"]
        DASH_DB[(MySQL Database)]
    end

    BROWSER --> NEXT
    NEXT --> PUBLIC
    NEXT --> AUTH_PAGES
    NEXT --> PROTECTED

    PROTECTED --> AUTH_API
    PROTECTED --> BOOK_API
    PROTECTED --> ADMIN_API
    PROTECTED --> INNOV_API

    PUBLIC --> CONTENT_API
    PUBLIC --> STORAGE_API

    AUTH_API --> JWT
    AUTH_API --> AUTH_SVC
    AUTH_API --> PRISMA

    BOOK_API --> AUTH_SVC
    BOOK_API --> PRISMA
    BOOK_API --> MAILER

    ADMIN_API --> AUTH_SVC
    ADMIN_API --> PRISMA
    ADMIN_API --> MAILER

    INNOV_API --> AUTH_SVC
    INNOV_API --> PRISMA
    INNOV_API --> SCORING
    INNOV_API --> MAILER
    INNOV_API --> STORAGE_SVC

    CONTENT_API --> AUTH_SVC
    CONTENT_API --> PRISMA
    CONTENT_API --> STORAGE_SVC

    CRON_API --> MAILER
    CRON_API --> PRISMA

    STORAGE_SVC --> MINIO
    MAILER --> SMTP
    AUTH_SVC --> GOOGLE
    
    PRISMA --> DB
    
    NEXT --> GA

    BROWSER -.->|coe_shared_token cookie| DASH_MW
    DASH_MW --> DASH_NEXT
    DASH_NEXT --> DASH_DB
```

## Request Flow (Typical Protected API)

```
Browser
  │
  ├─► Next.js App Router
  │     │
  │     ├─► Middleware (if applicable)
  │     │     └─► Check / set headers
  │     │
  │     ├─► Route Handler (/api/...)
  │     │     │
  │     │     ├─► Parse request body
  │     │     ├─► Zod validation
  │     │     ├─► authenticate() - verify JWT from cookie/bearer
  │     │     ├─► authorize() - check user role
  │     │     ├─► Business logic
  │     │     │     ├─► Prisma queries
  │     │     │     ├─► Email dispatch
  │     │     │     └─► Storage operations
  │     │     └─► Response { success, message, data }
  │     │
  │     └─► Server Component (for SSR pages)
  │           └─► Read cookies → authenticate → render
  │
  └─► Response to browser
```

## Module Dependency Map

```mermaid
graph LR
    AUTH["Authentication"] --> USER["User Management"]
    AUTH --> BOOK["Facility Booking"]
    AUTH --> INNOV["Innovation Platform"]
    AUTH --> CONTENT["Content Management"]
    AUTH --> ADMIN["Admin Portal"]
    AUTH --> FACULTY["Faculty Portal"]
    AUTH --> INTERN["Internship System"]
    AUTH --> DASH["Project Dashboard (external)"]

    CONTENT --> STORAGE["File Storage (MinIO)"]
    BOOK --> STORAGE
    INNOV --> STORAGE
    INNOV --> SCORE["Scoring Engine"]
    INNOV --> MAIL["Email System"]
    INNOV --> CERT["Certificate Engine<br/>certificate-issuance.ts"]
    HACKVERT["Hackathon Vertical (/hackathons/*)"] --> INNOV
    HACKVERT --> LEARN["Learning Resources<br/>/api/learning-resources"]
    CERT --> STORAGE
    CERT --> TICKET
    
    BOOK --> TICKET["Ticket System"]
    INNOV --> TICKET

    ADMIN --> MAIL
    ADMIN --> IMPERSONATE["Impersonation"]
    ADMIN --> USER

    FACULTY --> CONTENT
    FACULTY --> INNOV

    INTERN --> INNOV
    INTERN --> MAIL

    CRON["Cron Jobs"] --> MAIL
    CRON --> BOOK
    CRON --> INNOV

    MAIL --> SMTP["SMTP (Gmail OAuth2)"]
    STORAGE --> MINIO["MinIO Server"]

    DASH --> DASH_AUTH["Shared Auth (coe_shared_token)"]
    DASH --> DASH_MAIL["Dashboard Email"]
    DASH --> DASH_SHOWCASE["Showcase System"]
```

## Module Categories

| Category | Modules |
|----------|---------|
| **Core Infrastructure** | Authentication, JWT, RBAC, API Helpers, Validators |
| **User Management** | Registration (Student/Faculty), Profile, Faculty Approval |
| **Content Management** | News, Events, Grants, Announcements, Hero Slides |
| **Facility Booking** | Booking CRUD, Admin Moderation, Ticket Generation, Reminders |
| **Innovation Platform** | Open Problems (archived), Hackathons, Screening/Judging, Scoring, Leaderboard, Certificates |
| **Hackathon Vertical** | Public pages: `/hackathons/browse`, `/external`, `/learn`, `/my`, `/portfolio`, `/dashboard`, `/portal` |
| **Internship System** | Industry Internships, Faculty Internships, Workspaces |
| **Admin Portal** | Stats, User Directory, Email Broadcast, Impersonation |
| **Faculty Portal** | Content Publishing, Application Review, Hackathon Judging |
| **Email System** | Queue-based Delivery, Templates, Cron Worker, Retry Logic |
| **File Storage** | MinIO Client, Upload, Auth-gated Proxy Serving |
| **Certificate Engine** | Achievement/Participation PDF certificates, serials, backfill script |
| **Learning Resources** | `/api/learning-resources` + `/hackathons/learn` + admin management in `/admin/hackathons-content` |
| **Background Jobs** | Booking Reminders, Innovation Reminders, Email Queue Processing, Problem-Statement Notifications |
| **Project Dashboard** | External app (gitignored): Shared Auth, Project Management, Showcase, Email Outbox |
| **Notifications** | In-App Notifications, Email Notifications |
| **Analytics** | Google Analytics 4 Event Tracking |

## Data Flow Patterns

### Pattern 1: Authenticated API Request
```
1. Browser sends request with httpOnly cookies
2. Route handler calls authenticate(req)
3. authenticate() reads accessToken from cookie
4. verifyAccessToken() decodes JWT
5. Route handler calls authorize(user, 'ROLE')
6. If authorized → business logic → response
7. If not → 401/403 error response
```

### Pattern 2: Email Dispatch
```
1. Business logic calls sendEmail() or dispatchEmail()
2. dispatchEmail() creates EmailJob record in database
3. For immediate mode: sends via SMTP immediately
4. For bulk mode: queued for cron worker
5. Cron worker (GET /api/cron/email-queue) processes pending jobs
6. Failed jobs are retried (up to maxAttempts)
```

### Pattern 3: File Upload
```
1. Client sends multipart/form-data with file
2. Route handler reads file, converts to Buffer
3. minio.uploadFile(folder, { buffer, originalname, mimetype, size }) uploads to MinIO bucket
4. Returns object key (path in bucket)
5. Object key stored in database
6. File served via /api/storage/[...path] proxy
   (public folders stream directly; private folders require auth + ownership)
```

### Pattern 4: Cross-App Sync
```
1. User verifies OTP or registers via Google on CoE portal
2. CoE portal calls syncDashboardUser() (fire-and-forget)
3. syncDashboardUser() POSTs to dashboard's internal API
4. Dashboard upserts user record
5. Dashboard resolves any pending project assignments
6. User can now access dashboard without separate login
```

## Environment Configuration

The application requires these environment variable groups:

| Group | Variables | Purpose |
|-------|-----------|---------|
| **Database** | `DATABASE_URL` | MySQL connection string |
| **JWT Auth** | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | Token signing + TTLs |
| **Google Auth** | `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_REGISTRATION_SECRET`, `GOOGLE_SIGNIN_ENABLED`, `ALLOWED_EMAIL_DOMAIN` | OAuth |
| **Email** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | SMTP + OAuth2 |
| **Storage** | `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_USE_SSL`, `MINIO_BUCKET` | MinIO |
| **Analytics** | `NEXT_PUBLIC_GA_ID` | Google Analytics |
| **Cron** | `CRON_SECRET` (optional — falls back to ADMIN auth) | Cron job protection |
| **Dashboard Sync** | `DASHBOARD_URL`, `SYNC_SECRET` | Cross-app sync (external dashboard) |
| **Admin** | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Seed admin account |
| **Cookies/Other** | `COOKIE_SECURE`, `FRONTEND_URL`, `NEXT_PUBLIC_APP_URL`, `PRINCIPAL_EMAILS` | Cookie flags, app URLs, principal badge |

## Deployment Architecture

```mermaid
graph TB
    DNS["DNS: tcetcercd.in"] --> CF["CloudFlare / Nginx<br/>SSL Termination"]
    CF --> NEXT["Next.js App Server"]
    NEXT --> PRISMA["Prisma Client"]
    PRISMA --> DB[(MySQL Database)]
    NEXT --> MINIO["MinIO Object Store"]
    NEXT --> SMTP["SMTP Gateway"]
    
    CRON["External Cron Scheduler"] --> NEXT
    
    subgraph "Optional Docker Setup"
        DOCKER["docker-compose"]
        DOCKER_APP["App Container"]
        DOCKER_DB["MySQL Container"]
    end
```

## Security Architecture

```mermaid
graph LR
    subgraph "Defense Layers"
        L1["Layer 1: httpOnly Cookies<br/>Prevents XSS token theft"]
        L2["Layer 2: JWT Verification<br/>Tamper-proof tokens"]
        L3["Layer 3: Role Authorization<br/>authenticate() + authorize()"]
        L4["Layer 4: Zod Validation<br/>Input sanitization"]
        L5["Layer 5: bcrypt Password Hashing<br/>12 rounds, slow hashing"]
        L6["Layer 6: Rate Limiting<br/>Google: 30/10 req/min"]
        L7["Layer 7: CORS + Domain Checks<br/>Callback URLs, email domain"]
    end
    
    REQ["Request"] --> L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7 --> API["API Response"]
```
