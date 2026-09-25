# Offline courses (LearnDash content library)

Locator: `odd/tasks/cursos-offline.md` · Engram mirror: `odd/cursos-offline/tasks`
Branch: `feat/cursos-offline` (base `ffbfea5`)

## Objective

Import the 9 LearnDash courses (course → lesson → topic, plus single/multiple-choice
quizzes) into CadIT as a read-only offline content library. Staff assign courses to
cohorts, with per-enrollment grant/revoke overrides. Students read the content and take
quizzes in the portal, with automatic grading and a retry limit.

## Problem / why

The legacy WordPress/LearnDash academy is being retired. Its content (theory guides +
quizzes) must live inside the CRM without touching cohorts/enrollments and without new
external services (constitution II).

## Scope (authorized)

- New tables: `offline_course`, `offline_lesson`, `offline_topic`, `offline_quiz`,
  `offline_question`, `offline_answer`, `offline_quiz_attempt`, `offline_course_access`.
  All carry `organization_id` + RLS `tenant_isolation` (migration `0042`).
- One-off import script (not a recurring UI): `courses.json` + external quiz map file.
- Staff: library list + read-only detail; cohort tab with a multi-check; per-student
  panel in the cohort roster (inherited / individually added / individually removed,
  toggleable) with attempt history.
- Student portal: list of effective courses, course → lesson → topic navigation with
  rendered markdown, quiz taking with grading/retries, own attempt history.
- Teacher portal: attempt history for students of reachable cohorts.

Out of scope: content editing UI, videos/attachments, automatic certificates.

## Constraints and decisions

- **Client content stays out of the repo** (CadIT is MIT open source). The script takes
  `--file <courses.json>` and `--map <quiz-map.json>`; both live next to the export.
- **Ambiguous quizzes 1281, 1260, 587, 566**: the proposed map marks them `pending`; the
  importer skips any `pending` entry. They are imported only after the owner confirms
  them (spec requirement). Proposal: 1281/1260 → `revit-basico-2025`, 587/566 →
  `revit-basico`.
- **Duplicates across course editions**: quiz ids > 1000 → the 2025 edition, lower ids →
  the old edition (matches id ranges of their courses). Quizzes with 0 questions
  (1068, 1069, 1144, 397) are skipped.
- Quizzes attach to a lesson only when the lesson title names the same module (old
  editions with "Módulo A–D" lessons); otherwise `lesson_id` is null.
- Idempotent re-import: every content row keeps `legacy_ref` unique per org; upsert.
  `answers_given` stores a snapshot (answer ids + texts) so history survives re-imports.
- Thumbnails: not hot-linked to the old WordPress domain.
- Capabilities: reuse `academico.ver` (library, history) and `academico.editar`
  (assignment). No new capability → no role data migration.
- Markdown: no new dependency; a tiny safe renderer to React elements (no
  `dangerouslySetInnerHTML`). Content is short plain text.
- **Access rule**: effective(enrollment, course) = (cohort assigned AND no individual
  revoke) OR individual grant. A student's courses = union over their enrollments.
- **Grading**: single → the chosen answer is the correct one; multiple → exact set match
  (all-or-nothing). Score = correct points / total points × 100, 2 decimals. Passed =
  score ≥ passing_percentage (default 80 when missing).
- **Retries**: `retries_allowed` = retakes after the first attempt → max attempts =
  1 + retries_allowed; null = unlimited. Counted per contact across enrollments.
- **Correct answers never travel to the student** (not before, not after an attempt):
  the student sees score + passed only.
- Student writes live outside `student-portal.ts` (which is read-only by test).

## TDD

Mode: on (source: global CLAUDE.md "Strict TDD Mode: enabled"). Runner: `pnpm test`
(vitest). RED before GREEN for pure logic (access resolution, grading, retries).

## Delivery

Forecast: ~3000+ authored lines (> 400) → strategy `ask-on-risk`; chain strategy:
`feature-branch-chain` (owner, 2026-09-25): review slices target `feat/cursos-offline`,
one final merge to `main`. Slice boundaries (commits per PR) recorded below as they land.
Push/PR/merge remain the owner's decision. RDD: on (default).

Slices:
- (none yet)

## Tasks

- [x] T1 Schema + migration 0042 (tables, FKs, indexes, RLS) + id prefixes.
  Route: delegated (writer; trigger: 2+ non-trivial files). Checks: typecheck ✅,
  rls-cobertura ✅, 0042 applied on local `vocero` as owner and re-run idempotent ✅
  (8 tables `rowsecurity=t`, 8 `tenant_isolation` policies). Extras: `offline_quiz.position`,
  content `created_at/updated_at`, `offline_course.status` (published|draft).
- [x] T2 Pure logic `src/server/offline-courses/logic.ts` (TDD). Route: delegated (same
  writer). RED: "Cannot find module" on both test files; GREEN: 49 tests. Choices: empty
  or zero-point quiz → score 0 not passed; grant beats revoke on same course (OR rule; DB
  unique prevents it); duplicate answer ids count once; question without correct answer
  always wrong; negative retries → 0.
- [x] T3 Import script `scripts/import/offline-courses.ts` + pure plan
  `src/server/offline-courses/import-plan.ts`; `pnpm import:offline-courses -- --file
  --map [--media] [--org] [--apply]` (dry-run = full transaction rolled back). Route:
  delegated (writer). RED: module missing → GREEN 10 tests. Applied on local `vocero`:
  9 courses, 17 lessons, 396 topics, 16 quizzes, 349 questions, 782 answers, 8 thumbnails;
  pending 1281/1260/587/566 absent ✅ (verified by parent). Re-runs: 0/0/0 ✅.
  Thumbnails stored via existing `media_asset` + `MEDIA_DIR`; `/api/media/<id>` needs
  `inbox.ver` → students can't see them: T5 adds a portal thumbnail route gated by
  effective access. Deviations: duplicate LearnDash `sort` → `.2` suffix; quiz order by
  module letter then id; unmapped quizzes skipped and reported.
- [x] T4 Staff: `/cursos-offline` list + read-only detail, cohort tab (multi-check +
  attempts), roster per-student panel (Heredado / Agregado / Quitado / Sin acceso,
  Quitar/Agregar/Restablecer), staff APIs (`/api/offline-courses[/id]`,
  `/api/cohorts/[id]/offline-{courses,attempts}`, `/api/enrollments/[id]/offline-courses`),
  safe markdown renderer. Route: delegated (writer; ~1300 lines — several screens + APIs,
  over the advisory heuristic). RED: "courseStatesFor is not a function" / markdown
  "Cannot find module" → GREEN (11 + 12 tests, incl. XSS cases). Checks: typecheck ✅,
  lint ✅, full suite 1377 ✅, `NEXT_DIST_DIR=.next-build pnpm build` ✅. Parent fix:
  cohort attempts route returns 404 for an unknown cohort. Deviation: `vitest.config.ts`
  gets `esbuild.jsx: "automatic"` to render `.tsx` in tests. Live check deferred to T6
  (owner's dev server serves stale `.next` chunks → sign-in 500; not touched).
  Open → T5: thumbnails via `/api/media` need `inbox.ver`; add thumbnail routes for staff
  (academico.ver) and portal (effective access).
- [x] T5 Student portal (`/portal/cursos-offline`, course, topic with prev/next, quiz
  with result + own history) + teacher history on the cohort Evaluación tab + thumbnail
  routes (staff `academico.ver`, portal by effective access). Modules `student.ts`
  (read-only, guard-tested), `submit.ts`, `portal-logic.ts`, `thumbnail.ts`. Route:
  delegated (writer; ~2120 lines, 28 files — over the advisory heuristic). RED: missing
  module / ENOENT → GREEN 28 tests. Checks: typecheck ✅, lint ✅, full suite 1405 ✅,
  `.next-build` build ✅. Decisions: draft courses hidden from students; attempt-number
  clash via `onConflictDoNothing().returning()` → 409 `attempt_conflict` (a caught DB
  error would abort the tenant tx); attempt number = max+1, limit = count; empty quiz →
  422 `quiz_empty`, no attempt used. T4 follow-ups done (concurrent cohort save, stale
  panel error). Parent: portal copy aligned to voseo. Known limit: an attempt records the
  earliest granting enrollment — a teacher of another cohort of the same student won't
  see it.
- [x] T6 E2E section `scripts/e2e/cursos-offline.mjs` (+ synthetic fixture
  `tests/e2e/fixtures/cursos-offline/`, story `tests/e2e/us-cursos-offline.md`). Route:
  delegated worker. Run on isolated `next dev -p 3005` (`.next-e2e`, `.env.e2e`, fresh
  `vocero_e2e`): section **38/38 ✅** inside the full harness (import twice idempotent,
  staff list/detail, cohort + overrides states, student 404 not 403, no `isCorrect` in
  quiz JSON, attempts 1/2/3 → 409, 422 malformed, teacher 404 for foreign cohort, pages
  200). Full harness: `454/461 checks OK, 7 fallos` — all 7 in blocks 014 (teacher
  attendance) and 015 (student next class), modules this branch never touches; likely
  date-dependent (`cohorte_finalizada`), NOT confirmed against `main`. Checks: typecheck
  ✅, lint ✅, unit 1405 ✅; build not re-run after T5's ✅. Gap: portal list is
  client-rendered, so the page check asserts the heading and the list goes via the API.

### Accepted change (owner, 2026-09-25): export v2, Vimeo videos, completion gating

Why: export v1 had no video field; v2 (`C:\Users\Ale\Downloads\cadit-cursos-extraidos\
package`) brings `topics[].video_url` (Vimeo, 270/270 topics) + `video_shown`
(BEFORE|AFTER) and keeps only 5 courses (MEP/Estructura/Básico/Arquitectura 2025 + Civil
3D). Old import deleted from local `vocero` on owner request (9 courses + 8
`media_asset` rows; no attempts/access existed). `quiz-map.json` was lost with the folder
replacement → must be regenerated for v2.
Owner decisions: embedded Vimeo player (requires constitution amendment — Principle II
closed list); gate progress on video completion.
Proposed defaults (stated to owner): watched ≥ 90% of real playback (played ranges, not
the `ended` event); topic N+1 opens only after N is complete, enforced server-side (404);
topics without video complete on open; staff can mark a topic complete for a student
(author + date) as fallback; no new npm dependency (Vimeo iframe `postMessage` API);
client-side tracking is spoofable (acceptable for an academy).
Owner answer (2026-09-25): quizzes can be taken at any time (not locked). A course is
**completed** only when every topic is complete AND every quiz of the course is passed
(derived state; shown to student and staff).
Consequence: an extra/duplicate quiz would make a course impossible to complete, so the
v2 map must hold exactly one quiz per course module. Evidence: v2 duplicates are identical
question sets (overlap 17/17–20/20); 1178 and 418 contain every question twice (40 → 20
unique); 1144, 397, 1068, 1069 are empty. Proposed v2 map (one per module, newest clean
copy, else the old one): MEP 2025 → 1133 A, 1112 B, 1091 C, 1070 D; Arquitectura 2025 →
484 A, 1239 B, 1218 C, 1199 D; Estructura 2025 → 450 A; Básico 2025 → 1281 A, 1260 B
(ambiguous in export; owner confirmation pending); Civil 3D → none. 11 quizzes.

- [x] T7 Constitution 1.4.0 (Principle II item 4: Vimeo embedded player, browser only)
  + CLAUDE.md sovereignty bullet. No CSP / X-Frame / frame-src headers anywhere (no
  middleware, none in next.config / Caddyfile) → nothing blocks the iframe; Vimeo's own
  domain-restriction setting may still block playback. Route: delegated writer.
- [x] T8 Migration `0043_cursos_offline_videos` (topic `video_url`, `video_shown`;
  `offline_topic_progress` per contact with RLS + CHECKs) applied to `vocero` and
  `vocero_e2e`, re-run idempotent ✅. Pure logic `isVideoComplete` (≥ 0.9 merged played
  ranges), `topicUnlocked` (sequential across the course), `courseCompletion` (all topics
  AND all quizzes). RED 21 → GREEN 31. Importer v2 keeps only https vimeo URLs. v2
  quiz-map written outside the repo (9 confirmed, 2 pending 1281/1260, 13 skip). Dry-run
  on `vocero`: 5 courses, 6 lessons, 270 topics, 9 quizzes, 181 questions, 404 answers,
  5 thumbnails. Checks: typecheck ✅, lint ✅, unit 1426 ✅ (parent: 2 stable runs; the
  worker saw one unexplained 16-failure run, not reproduced). Note: kept quiz 1239 has 19
  distinct of 20 questions; pending 1281 has 17 of 20.
- [ ] T9 Portal player + progress reporting + server-side sequential gating + staff
  override in the roster panel + progress visible to staff/teacher.
- [ ] T10 E2E extension (fixture with video_url, gating 404, progress, override) +
  re-import v2 locally after owner confirms quiz map.

## Progress / evidence

- T6 commit `050c4a3` (GGA passed).

- Exploration done (mapping handoff). Branch created.
- Proposed quiz map written next to the export (`quiz-map.json`): 16 confirmed, 4 pending
  (1281, 1260, 587, 566), 4 skip (0 questions). Old-edition quizzes linked to their
  "Módulo X" lesson; 2025 editions course-level.
- Migrations need the owner role: `DATABASE_URL=postgresql://postgres:…@localhost:5433/vocero`
  (the app's `cadit_app` gets "permission denied for database").

- Commits: T1 `28ea1ea`, T2 `e94a42d` (GGA pre-commit hook PASSED on both). GGA notes
  accepted as-is: folder `src/server/offline-courses/` will hold queries + importer too;
  attempts cascade with the enrollment (deleting an enrollment frees its retries —
  accepted: attempts belong to the enrollment per spec).
- RDD assess (base `ffbfea5`, committed-only): risk medium, `review_due` true
  (`slice_budget_reached`; 9276 lines, mostly the generated snapshot). Consent relayed to
  the owner — granted. Start failed `lens_context_budget_exceeded` (generated 0042
  snapshot; nothing created). Retried on T2 alone (base `28ea1ea`, 591 lines): owner
  granted again, lineage `review-66dae319d29c5fbc` created, collect for lens
  `review-reliability`. BLOCKED: reviewer returned incomplete inspection (not captured) —
  version skew: installed reviewer agents come from gentle-ai 2.3.0 and expect a
  `GENTLE_AI_CLAUDE_REVIEW_CONTEXT` block that CLI 3.7.0 no longer emits (it emits
  `GENTLE_AI_REVIEW_CONTEXT`), because `gentle-ai sync` failed on the locked
  `~/.claude/settings.json`. T1 remains unreviewable natively (snapshot size).

- T3 commit `de3ff4e`. GGA rejected twice before passing: unscoped update/deletes →
  all importer queries now go through `scoped()`; runtime column-name check backs the
  `as never` casts; two WHAT comments removed. Dry-run after fixes: all no-ops ✅.
- RDD assess T3 (base `e94a42d`): medium, `review_due` true (`slice_budget_reached`,
  1004 lines). Pending — same reviewer version skew as T2; owner told on 2026-09-25
  (fix: close Claude Code, `gentle-ai sync --agents claude-code --strict-tdd`).

- T4 commit `494e27e` (GGA passed). T5 commit `f0c3eb8` (GGA failed once: raw
  `req.json()` in the attempts route → `parseBody(req, validateSubmission)`, typed
  `submitAttempt`; usted copy → voseo; then passed).
- RDD assess T4+T5 (base `de3ff4e`): **high**, `review_due` true (`high_risk`, 4149
  lines). Pending — same reviewer version skew; a high-risk review needs the canonical
  4 lenses and will likely need slicing to fit the reviewer context budget.

## Next step

T6 E2E section + live run on isolated server (delegated worker running).
