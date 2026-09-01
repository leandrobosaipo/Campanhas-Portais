# AdOps Evidence Report Visual Parity and Performance Implementation Plan

> **For agentic workers:** Execute task by task in the isolated worktree. Keep production unchanged until all contract, visual, performance, and public readback gates pass.

**Goal:** Make the single dynamic evidence report reproduce the complete August report experience on desktop and mobile while loading lists, filters, thumbnails, and evidence details quickly from the AdOps API.

**Architecture:** Keep one small dynamic HTML shell. Replace the current request-time audit pipeline with a database-backed read model assembled with bounded SQL queries; keep strict audit validation in the capture/write workflow. Load campaign summaries first, evidence-day metadata with the page response, and image bytes only when a thumbnail or modal enters the viewport.

**Tech Stack:** TypeScript, Express, Drizzle ORM, PostgreSQL, vanilla HTML/CSS/JavaScript, Node test runner, Playwright/Chrome, Cloudflare public API proxy.

**Spec:** The public August report at `https://sites.codigo5.com.br/reports/adops-evidencias-agosto-2026/?layout-audit=1`, visually audited on 2026-09-01 at 1440×1100 and 390×844.

## Global Constraints

- Preserve one public URL: `/reports/adops-evidencias/`.
- Default to the current month in `America/Cuiaba`; never persist an old month automatically.
- Preserve all security, audit, publication, and export readiness checks.
- Do not regenerate a large HTML file when records change.
- Do not expose credentials, internal metadata, or private admin URLs that are not already authorized public fields.
- Do not publish until desktop and mobile screenshots, API timing, tests, build, and public readback pass.
- Keep the user's original checkout untouched; implement only in the isolated worktree.

## Observed Reference Contract

### Header and operation area

- Blue `A5` mark; title `Evidências AdOps · MÊS/ANO`; exact start/end dates and update timestamp.
- Right-side metrics: insertions, active, attention, prints, plus `Mais números` details.
- Operational strip: current routine state, last run/date, next capture countdown, icon buttons `Rotina`, `Fontes`, `Agenda`, and a translated health badge such as `Em dia`.
- Desktop filter row: search, portal, publication, evidence; Portuguese labels and options.
- Mobile condensed identity: title, month, date range, campaign count, blue filter button with funnel icon.

### Operation modals

- Shared title `Operação AdOps`, close button, three tab buttons with selected state.
- `Rotina`: translated result sentence, health badge, registered state, start/end, original result, last sheet day, and job identifier.
- `Fontes`: description plus icon cards for the exact monthly spreadsheet tab and shared media folder.
- `Agenda`: two cards, `Próximas a entrar no ar` and `Próximas a vencer`, with empty-state copy when applicable.
- On mobile, these become bottom sheets with safe-area padding and 44 px minimum controls.

### Portal, campaign, and insertion boxes

- Portal logo, public name, domain, and counts for active, scheduled, ended, current, pending, invalid, and unpublished.
- Campaign name, client, agency, PI, insertion count, approved/required print count, and a plain-language status summary.
- Campaign download actions remain visible and explain readiness instead of disappearing.
- Insertion cards include media preview/type, insertion number, ended/active status, evidence status, normalized position, client/PI/portal, period sentence, progress text and bar, then four icon actions: portal, advertisement, media, AdOps.
- Evidence rail says `Prints, mais recentes primeiro`, shows approved/required count, uses real thumbnails, date chips, `Mais recente`, horizontal snapping, and translated pending/error cards.

### Evidence modal

- Large black image stage plus compact side panel on desktop; full-screen stacked layout on mobile.
- Title `#ID · CAMPANHA`, selected date, previous/next day controls, day selector with audited/current/error states.
- Collapsible details: portal, client, agency, PI, format, period, evidence progress, translated status, ZIP readiness, pending/invalid dates, and AdRotate group.
- Actions: download JPEG, open portal, advertisement group, media, and AdOps.
- Keyboard focus, Escape/close, disabled navigation boundaries, `aria-current=date`, meaningful image alt text.

## Baseline Findings

- August reference: 6 portals, 30 campaigns, 37 insertions, 414 evidence thumbnails.
- Dynamic API, August first page: about 7.5 s TTFB and 62.8 KB.
- Portal-filtered August request: about 5.3 s; repeated request still about 4.7–5.3 s, so current cache does not materially help.
- Search `ESTIAGEM`: about 2.9–4.5 s.
- Individual thumbnail requests observed at about 6.7–9.2 s each.
- Current route reads every campaign and filters competency in JavaScript.
- `enrichInsertion()` performs campaign, site, evidence count, client, and agency queries per insertion (N+1).
- Evidence rows are queried per insertion; every evidence date calls checklist/metadata logic and performs a live storage `HEAD` request.
- Missing database indexes were observed for `campaigns.competencia`, `insertions.campanha_id`, `evidences.insercao_id`, and the report-oriented capture log key.
- Current pagination slices insertions but reports campaign totals; this can split one campaign across pages.
- Closely spaced search/select changes can race with option repopulation and produce a stale or empty result.

---

### Task 1: Freeze the August visual and content contract

**Files:**
- Create: `scripts/src/test-dynamic-evidence-report-visual-contract.mjs`
- Create: `scripts/src/test-dynamic-evidence-report-browser.mjs`
- Modify: `scripts/src/test-dynamic-evidence-report.mjs`

**Produces:** Automated checks for every required section, Portuguese copy, icon/action, responsive breakpoint, and modal state.

- [ ] Add fixture data representing audited, pending, invalid, unpublished, scheduled, video, image, missing-media, and ZIP-blocked insertions.
- [ ] Add failing HTML contract assertions for header metrics, operation tabs/content, portal statistics, campaign summary/downloads, insertion actions, evidence rail, and complete modal metadata.
- [ ] Add Playwright screenshot scenarios at 1440×1100, 768×1024, 390×844, and 360×800.
- [ ] Assert zero horizontal page overflow, 44 px controls, keyboard focus visibility, dialog focus trapping, translated visible strings, and image alternative text.
- [ ] Run `node --test scripts/src/test-dynamic-evidence-report*.mjs`; confirm RED because the dynamic page lacks reference content and interactions.
- [ ] Commit only the failing contract tests and captured reference metadata.

### Task 2: Replace N+1 report reads with bounded SQL

**Files:**
- Modify: `artifacts/api-server/src/routes/insertions.ts`
- Modify: `artifacts/api-server/src/lib/monthly-evidence-report-query.ts`
- Create: `artifacts/api-server/src/lib/monthly-evidence-report-read.ts`
- Create: `artifacts/api-server/src/lib/monthly-evidence-report-read.test.ts`

**Produces:** `readMonthlyEvidenceReportPage(query)` returning campaign-grouped rows using a bounded query count.

- [ ] Write a failing repository test that records executed SQL statements and requires a constant query count as insertion count grows.
- [ ] Query matching campaigns in PostgreSQL instead of selecting the whole table; keep accepted competency variants explicit and covered by tests.
- [ ] Join insertions, campaigns, sites, clients, and agencies in one report query, applying month overlap, archive/supersession, cancellation, portal, publication, and search predicates before pagination.
- [ ] Paginate by campaign ID plus deterministic insertion ordering, never by an insertion offset that can split a campaign.
- [ ] Fetch all evidence rows and capture proof rows for the page's insertion IDs with one `IN (...)` query each; group them in memory by insertion/date.
- [ ] Remove `enrichInsertion()` from this report route; leave it unchanged for other endpoints.
- [ ] Compute portal/campaign/page summaries from the same filtered relation so totals and visible cards cannot disagree.
- [ ] Run the repository test and route tests; confirm GREEN, then refactor names only after behavior passes.
- [ ] Commit the bounded read implementation separately.

### Task 3: Add only the indexes proven by the report query

**Files:**
- Modify: `lib/db/src/schema/campaigns.ts`
- Modify: `lib/db/src/schema/insertions.ts`
- Modify: `lib/db/src/schema/evidences.ts`
- Modify: the capture-proof-log schema file under `lib/db/src/schema/`
- Create: `ops/portainer/adops-stack/migrations/2026-09-01-evidence-report-read-indexes.sql`

**Produces:** Reversible indexes for the actual query predicates and joins.

- [ ] Capture `EXPLAIN (ANALYZE, BUFFERS)` for the new read query before indexes using production-like data, without writing data.
- [ ] Add `campaigns(competencia)`, `insertions(campanha_id, periodo_inicio, periodo_fim)`, `evidences(insercao_id, criado_em)`, and `capture_proof_logs(insertion_id, target_date, updated_at DESC)` indexes using `IF NOT EXISTS` in the migration.
- [ ] Re-run `EXPLAIN`; keep an index only when the planner uses it or measured work falls materially.
- [ ] Add schema/migration consistency assertions.
- [ ] Document `DROP INDEX IF EXISTS ...` rollback statements in the migration comments.
- [ ] Commit schema and migration together; do not apply to production until the API build and staging query pass.

### Task 4: Stop performing live storage audits during list reads

**Files:**
- Modify: `artifacts/api-server/src/lib/monthly-evidence-report-read.ts`
- Modify: capture completion code that writes `capture_proof_logs`
- Add tests beside the capture completion and monthly read modules.

**Produces:** Persisted report status derived from the already-audited capture result; list GET performs no external storage requests.

- [ ] Write a failing test that makes external `fetch` throw and proves the monthly report still returns persisted audited/missing/invalid states.
- [ ] On capture/audit completion, persist the final status, checklist approval, audit issue summary, canonical evidence URL, and timestamp in the existing capture proof record.
- [ ] Build evidence-day state from evidence rows plus the latest capture proof row; do not call `resolveEvidenceAuditStatus()` or storage `HEAD` from the monthly GET.
- [ ] Keep strict live reachability/audit checks on capture, regeneration, explicit audit endpoints, and final ZIP export.
- [ ] Return `verifiedAt` per evidence day so the UI can explain freshness without claiming a new live audit.
- [ ] Add an explicit fallback state for historical rows without persisted proof; never silently label them audited.
- [ ] Run tests with network disabled and confirm the list endpoint remains correct and fast.
- [ ] Commit the persisted read-path change separately.

### Task 5: Make thumbnails and modal images fast and cacheable

**Files:**
- Modify: `artifacts/api-server/src/routes/insertions.ts`
- Modify: `ops/cloudflare-public-api/src/index.ts` or the existing public proxy route that handles API caching
- Modify: `scripts/src/build-dynamic-evidence-report.mjs`
- Add focused API and browser tests.

**Produces:** A display endpoint separate from forced download, with stable caching and progressive loading.

- [ ] Write a failing endpoint test for `GET /api/insertions/:id/evidences/:date/preview?width=...` requiring `Content-Type: image/jpeg`, inline disposition, ETag, and public cache headers.
- [ ] Reuse the existing image preparation code; do not add a new image library.
- [ ] Cache the transformed derivative by evidence ID/version plus width/quality so repeated requests do not refetch and reconvert the original.
- [ ] Keep `download` as attachment for the explicit `Baixar JPEG` action; use `preview` only in `<img>` elements.
- [ ] Render the newest 2–3 thumbnails per visible insertion first; assign remaining `src` values through one `IntersectionObserver` rooted in each horizontal rail.
- [ ] Give images fixed aspect ratios and dimensions to prevent layout shift; use `decoding=async`, appropriate `fetchpriority`, and an error card with retry instead of an empty rectangle.
- [ ] On evidence modal open, request the selected preview first and prefetch only the adjacent previous/next dates.
- [ ] Measure cold and warm preview timings; require warm cached previews below 500 ms at the public edge and no eager requests for off-screen rails.
- [ ] Commit API preview/cache and frontend progressive loading as one independently testable behavior.

### Task 6: Rebuild the dynamic shell from the exact August components

**Files:**
- Modify: `scripts/src/build-dynamic-evidence-report.mjs`
- Modify: `scripts/src/test-dynamic-evidence-report.mjs`

**Produces:** Full visual/content parity without embedding campaign records in HTML.

- [ ] Copy the existing August component markup, SVG icon paths, design tokens, spacing, borders, badges, progress bars, and responsive rules from `build-current-month-evidence-report.mjs`; do not redesign them.
- [ ] Render the complete header metrics and `Mais números` details from API summary fields.
- [ ] Render operation strip and three tabbed modals with the same labels, selected states, icon cards, and empty states.
- [ ] Render portal heads, complete campaign summaries/download readiness, insertion cards, action icons, evidence rails, and translated status copy.
- [ ] Keep the current-month selector and dynamic fetching while matching the August desktop and mobile structure.
- [ ] Make desktop filters and mobile bottom-sheet filters share one state object; never clone live controls or repopulate a selected value during an in-flight request.
- [ ] Run Task 1 tests to GREEN and refactor only duplicated rendering helpers that have at least two callers.
- [ ] Commit the visual parity implementation.

### Task 7: Make filter changes instant, ordered, and race-safe

**Files:**
- Modify: `scripts/src/build-dynamic-evidence-report.mjs`
- Extend: `scripts/src/test-dynamic-evidence-report-browser.mjs`

**Produces:** One filter state machine with abortable, deduplicated requests and stable controls.

- [ ] Add a failing browser test that types rapidly, clears search, changes portal, and changes evidence status; require only the final request to update the DOM.
- [ ] Keep 250–350 ms debounce for free-text search; apply select/month changes immediately.
- [ ] Increment request sequence and abort the previous `fetch`; ignore late responses even when abort arrives after response headers.
- [ ] Preserve portal options separately from result data and preserve the selected value across loads.
- [ ] Cache recent JSON responses in memory by normalized query for a short session lifetime; stale-while-revalidate the visible result without persisting an old month.
- [ ] Show compact skeletons only on first/month load; on filter changes retain the current layout with an `Atualizando` state to avoid flashing empty content.
- [ ] Reset pagination on any filter change and append only when the cursor/query key still match.
- [ ] Run the race test repeatedly and require identical final cards and URL parameters.
- [ ] Commit filter behavior independently.

### Task 8: Complete the evidence and operation modals

**Files:**
- Modify: `scripts/src/build-dynamic-evidence-report.mjs`
- Extend: `scripts/src/test-dynamic-evidence-report-browser.mjs`

**Produces:** Exact August modal content and behavior on desktop and mobile.

- [ ] Add failing assertions for evidence title/date, day navigation, day states, collapsible metadata, five actions, translated labels, and disabled boundaries.
- [ ] Implement evidence navigation using already-loaded day metadata; fetch only preview bytes as the selected day changes.
- [ ] Restore full details content including ZIP readiness and pending/invalid dates from public API fields.
- [ ] Restore operation tabs with icon states and mobile bottom-sheet presentation.
- [ ] Implement focus return, Escape, backdrop close, `aria-current`, live date announcement, and full-screen mobile image stage.
- [ ] Run keyboard-only and 390 px browser scenarios to GREEN.
- [ ] Commit modal completion.

### Task 9: Verify performance, compliance, quality, and production release

**Files:**
- Modify only if a verified defect is found during this gate.

**Produces:** Fresh evidence that the release is correct, fast, public, and reversible.

- [ ] Run Spec Compliance against every item in `Observed Reference Contract`; list any intentional mismatch and block release if it loses content.
- [ ] Run Code Quality review for duplicated render code, stale request handling, unsafe URLs, accessibility, error states, query count, and unnecessary abstractions.
- [ ] Run API unit/integration tests, dynamic report tests, lint, API build, frontend/report generation, and `git diff --check`.
- [ ] Re-run capture-rule integrity before any production deploy.
- [ ] Measure cold and warm API requests for current month, August, portal, search, publication, evidence, and pagination. Targets: list TTFB under 1.0 s warm and 2.0 s cold; filtered interaction visible update under 1.0 s warm.
- [ ] Measure thumbnail behavior: only viewport/near-viewport requests, newest visible thumbnails render first, warm edge preview under 500 ms, zero broken images in the sampled page.
- [ ] Compare desktop/mobile screenshots side by side with the August reference for header, all operation modals, portal/campaign/insertion boxes, evidence rail, evidence modal, and filter sheet.
- [ ] Deploy through the existing production script with backup/rollback; apply the index migration only after preflight and record exact rollback commands.
- [ ] Validate the canonical public URL at current month and August: HTTP 200, correct month, logos, thumbnails, filters, modal navigation, ZIP button/readiness, zero console errors, zero page overflow.
- [ ] Report confirmed, pending, blocked, and inferred items separately; do not declare ready from build or HTTP 200 alone.

## Definition of Done

- The dynamic page contains every observed August header, modal, portal, campaign, insertion, evidence, icon, translation, and action detail.
- Desktop and mobile visual checks match the reference structure and finish; no horizontal page overflow at 360/390 px.
- The monthly list GET performs a bounded number of database queries and zero external storage checks.
- Pagination is campaign-based and filters cannot race or erase a valid selection.
- Warm list/filter reads meet the timing targets and thumbnails use cached previews with progressive loading.
- Current month remains the default and older months remain reachable from the same URL.
- Production behavior is visually verified with fresh public screenshots and a tested rollback path.
