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
- [ ] T3 Import script + proposed quiz map; dry-run and apply against the local DB.
  Route: delegated. Checks: dry-run report, row counts, re-run idempotent.
- [ ] T4 Staff: library pages, cohort tab, roster per-student panel, attempt history,
  APIs. Route: delegated. Checks: typecheck, lint, route-capabilities, tema-oscuro.
- [ ] T5 Student portal (list, navigation, quiz, history) + teacher history. Route:
  delegated. Checks: student-portal guard tests, typecheck.
- [ ] T6 E2E section + full gate (`typecheck && lint && build && test`) + live
  self-test. Route: delegated test worker + inline verification.

## Progress / evidence

- Exploration done (mapping handoff). Branch created.
- Proposed quiz map written next to the export (`quiz-map.json`): 16 confirmed, 4 pending
  (1281, 1260, 587, 566), 4 skip (0 questions). Old-edition quizzes linked to their
  "Módulo X" lesson; 2025 editions course-level.
- Migrations need the owner role: `DATABASE_URL=postgresql://postgres:…@localhost:5433/vocero`
  (the app's `cadit_app` gets "permission denied for database").

## Next step

T3 import script.
