# UI Redesign — Carbon/Linear-Inspired Precision Pass

Date: 2026-08-08 · Branch: `vertical/hackathons` · Stack: Next.js 16 + Tailwind v4 + Stitch tokens

## Design direction

The portal already had a strong editorial base ("Stitch" institutional blue/gold, Material-3
tokens, Newsreader serif display). This pass applied the discipline of two design systems
via the `popular-web-designs` skill (IBM Carbon for flat, shadow-averse institutional
precision; Linear for data-dense dashboard typography) plus `claude-design`'s surface audit
and anti-slop diagnostics:

- **Surfaces named before tokens:** browse = *Explore* (filter + grid), landing = *Decide/Learn*
  (hero allowed), dashboard = *Monitor* (glanceable), detail = *Inspect*.
- **Kill the identical-card grid:** event cards now vary by status/featured state.
- **Mono metadata everywhere** (dates, counts, labels) — the Carbon/Linear signature.
- **Hairlines instead of boxes** for internal separation; 0px radius preserved.
- **No new colors** — same navy/gold system, tokenized and consistent.

## What changed

### Design tokens — `src/app/globals.css`
- **Fixed a latent bug:** `--color-muted` was used by dozens of `text-muted` classes across
  the app but never defined — every one silently no-op'd. Added `--color-muted: #747782`.
- Added `--color-hairline`, `--color-success`, `--color-success-container`, `--color-warning`.
- Added `--font-mono` (system mono stack, no new network font).
- Body: Inter `cv01/ss03` font-feature settings, `text-rendering: optimizeLegibility`.
- `text-wrap: pretty` on headings/paragraphs.
- `.ghost-num` utility (editorial oversized numerals).
- Carbon-style `:focus-visible` ring + navy `::selection`.
- `prefers-reduced-motion` disables marquee/pulse.

### Event card — `src/components/hackathons/EventCard.tsx`
Status-aware treatments (no more identical tiles):
- **Featured** → navy band, white text, gold "Featured" chip, ghost index numeral.
- **ACTIVE** → white with 2px gold top hairline + pulsing "Live" indicator.
- **JUDGING** → gold top hairline, gold label.
- **UPCOMING** → white with hairline top rule.
- **CLOSED** → muted surface, "Results →" affordance.
- All: mono type/date/problem-count metadata, hover = background-shift (Carbon, no shadows),
  `index` prop renders ghost `01`, `02`, … numerals.

### Browse — `src/app/hackathons/browse/page.tsx`
- Mono breadcrumb, mono result count with hairline rule + active filter readout
  ("2 events · all · soonest").
- Indexed cards, refined empty/error states.

### Filter bar — `src/components/hackathons/FilterBar.tsx`
- Carbon bottom-border search field (blue focus line).
- Selects → segmented underline controls for status + sort (URL-driven behavior unchanged).

### Landing — `src/app/hackathons/page.tsx`
- Hero: hairline vertical rules grid, mono overline, ghost "TCET" watermark.
- CTA cards no longer identical: "External opportunities" = navy band with ghost `01`,
  "Learning hub" = white with gold hairline and ghost `02`.

### Event hero — `src/components/hackathons/EventHero.tsx`
Hairline rule grid, mono metadata blocks (dates/department/reg-close), ghost day numeral
on large screens.

### Stat band — `src/components/hackathons/StatBand.tsx`
Hairline rules between cells, mono micro-labels, tabular numerals, first-stat emphasis.

### Event detail — `src/app/hackathons/[id]/EventDetailClient.tsx`
- Registration sidebar: replaced the gold left rail (slop tell) with hairline row dividers.
- Meta grid + problem indices → mono; leaderboard rank circles → sharp squares.

### Consistency sweep (173 replacements)
`dashboard`, `my`, `portfolio`, `RegistrationForm` bypassed the token system with hardcoded
hexes (`#002155`, `#c4c6d3`, `#434651`, …). All mapped to Stitch tokens. Zero hardcoded
hexes remain in the hackathon vertical.

### Footer — `src/components/Footer.tsx`
Tokenized, hairline top rule (was 4px navy band), mono micro-labels, consistent hover states.

### Small
- `CategoryChips` → sharp Carbon-flat chips (was generic pills).
- `TabBar` counts → mono.
- `RegistrationForm` inputs → tokenized (focus stays boxed for form reliability).

## Explicitly not touched
- `src/app/admin/AdminPanelClient.tsx` (7,187 lines, all judging/screening logic) — no
  logic or layout risk taken there; it already uses the token system's palette.
- All API routes, DB schema, business logic — zero changes in this pass.

## Mobile layout + single-hub pass (same day)

Reported on phone: sub-nav hidden under the fixed navbar, hero pushed mid-page,
logged-out users seeing Dashboard/Portfolio links. Fixed:

### Fixed-nav offset (root cause)
The global chrome is fixed: ticker (32px) + top nav (~72px mobile / ~80px desktop).
The hackathon layout started at y=0 (sub-nav buried under the navbar) while every
page added its own `pt-[120px]` on top of the layout's padding → hero at mid-page.
- `src/app/hackathons/layout.tsx` is now a **server component** that verifies the
  access token from cookies and offsets the whole layout by `pt-[104px] md:pt-[112px]`.
- Removed `pt-[120px]` (and stray `mt-10`) from all 8 hackathon pages (landing,
  browse, dashboard, my, portfolio, external, learn, event detail).
- Verified in-browser: ticker 0–32, navbar 32–112, sub-nav starts at 112 — zero
  overlap; hero starts directly below the sub-nav.

### Auth-gated sub-nav
New `src/app/hackathons/HackathonsNav.tsx` (client, receives verified user):
- Public: **Browse · Opportunities · Learning** (mono, sharp tabs, mobile
  single-line scroll — no more wrapping pill pile-up).
- Logged-in only: **My Portal** — Dashboard/My Hackathons/Portfolio links removed.
- Root "Hackathons" link active only on the exact landing route (was always active).

### One hub instead of three pages
New `/hackathons/portal` (server page + `PortalClient.tsx`) — a single Monitor
surface where a signed-in student gets everything: profile strip (name, email,
UID, role, initials block), stat strip, registrations with status pills, recent
results with scores, tickets rail (QR download), certificates rail, and
recommended events (reusing the status-variant EventCard grid). Logged-out →
307 to `/login?next=/hackathons/portal`. Old `/hackathons/dashboard`,
`/hackathons/my`, `/hackathons/portfolio` redirect clients into the portal;
landing + event detail links point at the portal.

### Declutter pass (feedback round 2)
- **Sub-nav polished** — replaced the mono micro-labels with the app's editorial
  language: serif "Hackathons" wordmark, hairline divider, sans uppercase links
  with gold underline active state (mirrors the main navbar), and a distinct
  outlined **My Portal** button for signed-in users. No more mono-everywhere.
- **Landing decluttered** — 6 stacked sections → 4: hero now carries the stats
  inline (hairline-divided row inside the navy band, kills the separate StatBand
  section), featured + upcoming merged into ONE "Events" grid (featured render
  as navy cards), redundant sub-copy removed, TCET watermark dropped, CTA cards
  tightened (Learning hub now the navy card, External the outlined one).
- **Nothing hidden on mobile** — sub-nav links now wrap (`flex-wrap`) instead of
  living in a horizontal scroll strip, so Browse/Opportunities/Learning/My Portal
  are always visible with no scroll affordance needed; hero adds a
  "New to hackathons? Start in the Learning hub →" text link in the first viewport.
- **Links in descriptions** — restored on every surface: shared `splitDescription`
  helper in `EventCard.tsx`; event cards render URLs as gold underlined link text
  and drop the 2-line clamp when a URL is present (was being clipped away); the
  event hero renders them as real clickable `<a>` links (new tab); the event
  detail About/Problems tabs already linked them.

## Verification
- `npm run build` (includes `next typegen` + TypeScript) — clean, exit 0.
- Live on port 6356 (dev DB `coe_db_dev`): `/`, `/hackathons`, `/hackathons/browse`,
  `/hackathons/dashboard`, `/hackathons/my`, `/login` all 200.
- Browser-verified: browse page renders new segmented filters, mono counts, status-variant
  cards; landing renders new stat band + navy CTA card.
- Mobile (390×844) screenshots captured via headless Chromium; geometry verified via
  live DOM: no navbar overlap, hero directly under sub-nav, auth-gated nav for
  logged-out users, `/hackathons/portal` 307s to login, old pages bounce into the portal.
