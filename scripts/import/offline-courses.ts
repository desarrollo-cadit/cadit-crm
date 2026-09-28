/**
 * cursos-offline — Import the LearnDash content library (courses, lessons,
 * topics, quizzes, questions, answers) into ONE organization.
 *
 * Usage:
 *   pnpm import:offline-courses -- --file <courses.json> --map <quiz-map.json>
 *        [--media <dir>] [--org <organizationId>] [--overwrite] [--apply]
 *
 *   Without --apply it is a DRY-RUN: the whole import runs inside a
 *   transaction that is rolled back, so the report (insert / update / kept /
 *   no-op / delete per table) is exact and the database is left untouched.
 *
 * The client content never enters the repository (CadIT is MIT): both files
 * live next to the export and are passed by path.
 *
 * Idempotent (constitution IV): every row is matched by
 * (organization_id, legacy_ref); existing ids are preserved, so attempts and
 * access rows keep pointing at the same content.
 *
 * Policy since T11 (the content is edited from the staff UI): INSERT-ONLY by
 * default. A row whose legacy_ref already exists is left untouched and
 * reported as "kept" — edited from the UI or already imported, the import
 * cannot tell and must not undo an edit. `--overwrite` restores "the export
 * wins": differing fields are updated, and questions/answers of a re-imported
 * quiz that disappeared from the export are deleted (attempts keep a text
 * snapshot in `answers_given`). Attempts/access rows are never touched.
 *
 * Thumbnails: never hot-linked to the retired WordPress domain. With
 * `--media <dir>` each course thumbnail (file name = basename of the old URL)
 * is stored through the existing self-hosted media storage — a `media_asset`
 * row plus the file in `MEDIA_DIR/<org>/<assetId>` — and `thumbnail_url`
 * becomes `/api/media/<assetId>`. Without `--media` thumbnails are left as
 * they are (NULL on first import). `MEDIA_DIR` must be the SAME volume the app
 * reads (default `./.dev-media`, as in `src/lib/env.ts`).
 *
 * Connection: DATABASE_URL. The transaction declares `app.current_org`, so it
 * works as the owner role and as `cadit_app` (subject to RLS).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { newId, type IdKind } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { buildImportPlan, decideUpsert, type ImportPlan } from "@/server/offline-courses/import-plan";

/* ---------- CLI ---------- */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = arg("file");
const mapFile = arg("map");
const mediaDir = arg("media");
const orgArg = arg("org");
const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");

if (!file || !mapFile) {
  console.error(
    "Usage: --file <courses.json> --map <quiz-map.json> [--media <dir>] [--org <organizationId>] [--overwrite] [--apply]"
  );
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[offline-courses] Missing DATABASE_URL");
  process.exit(1);
}

const plan: ImportPlan = buildImportPlan(
  JSON.parse(readFileSync(file, "utf8")),
  JSON.parse(readFileSync(mapFile, "utf8"))
);

/* ---------- Plan report ---------- */

console.log(
  `\n[offline-courses] ${apply ? "APPLY" : "DRY-RUN"} · ${overwrite ? "OVERWRITE (the export wins)" : "insert-only"} — plan from ${path.basename(file)}`
);
console.log(
  `  courses ${plan.courses.length} · lessons ${plan.lessons.length} · topics ${plan.topics.length}` +
    ` · quizzes ${plan.quizzes.length} · questions ${plan.questions.length} · answers ${plan.answers.length}`
);
const pending = plan.skipped.filter((s) => s.status === "pending");
const otherSkips = plan.skipped.filter((s) => s.status !== "pending");
for (const s of pending) {
  console.log(`  PENDING owner confirmation — not imported: ${s.legacyRef} "${s.title}" (${s.reason})`);
}
for (const s of otherSkips) {
  console.log(`  skipped (${s.status}): ${s.legacyRef} "${s.title}" — ${s.reason || "no reason"}`);
}
for (const w of plan.warnings) console.log(`  warning: ${w}`);

/* ---------- Upsert machinery ---------- */

type Counts = { insert: number; update: number; kept: number; noop: number; delete: number };
const counts: Record<string, Counts> = {};
const count = (table: string): Counts =>
  (counts[table] ??= { insert: 0, update: 0, kept: 0, noop: 0, delete: 0 });

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type ContentTable =
  | typeof schema.offlineCourse
  | typeof schema.offlineLesson
  | typeof schema.offlineTopic
  | typeof schema.offlineQuiz
  | typeof schema.offlineQuestion
  | typeof schema.offlineAnswer;

/**
 * Insert (or, with --overwrite, upsert) `rows` (already carrying resolved FK
 * ids) by legacy_ref and return legacy_ref → id for everything the plan
 * contains. What happens to an existing row is `decideUpsert`'s call; only the
 * listed `fields` are compared, so a second --overwrite run is all no-ops.
 * `set as never` / `values as never`: one helper for six tables whose row
 * types drizzle cannot unify; the rows are built from the typed plan. Since the
 * compiler cannot check the column names there, the helper checks them at
 * runtime before touching the table: a typo fails the run, not the database.
 */
async function upsert(
  tx: Tx,
  label: string,
  table: ContentTable,
  kind: IdKind,
  orgId: string,
  rows: Array<Record<string, unknown> & { legacyRef: string }>,
  fields: string[]
): Promise<Map<string, string>> {
  const unknown = [...fields, ...Object.keys(rows[0] ?? {})].filter((k) => !(k in table));
  if (unknown.length > 0) throw new Error(`${label}: unknown column(s) ${unknown.join(", ")}`);

  const c = count(label);
  const existing = new Map<string, Record<string, unknown>>();
  const current = (await tx
    .select()
    .from(table)
    .where(scoped(table.organizationId, orgId))) as Array<Record<string, unknown>>;
  // Rows created from the UI have no legacy_ref: nothing in the export matches them.
  for (const r of current) if (typeof r.legacyRef === "string") existing.set(r.legacyRef, r);

  const ids = new Map<string, string>();
  const inserts: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const old = existing.get(row.legacyRef);
    // `undefined` in `row` = "leave as it is" (a course whose thumbnail was not resolved).
    const decision = decideUpsert(old, row, fields, overwrite);
    if (!old || decision.kind === "insert") {
      const id = newId(kind);
      ids.set(row.legacyRef, id);
      inserts.push({ ...row, id, organizationId: orgId });
      continue;
    }
    const id = old.id as string;
    ids.set(row.legacyRef, id);
    if (decision.kind === "kept") {
      c.kept++;
      continue;
    }
    if (decision.kind === "noop") {
      c.noop++;
      continue;
    }
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const f of decision.changed) set[f] = row[f];
    await tx
      .update(table)
      .set(set as never)
      .where(scoped(table.organizationId, orgId, eq(table.id, id)));
    c.update++;
  }
  for (let i = 0; i < inserts.length; i += 200) {
    await tx.insert(table).values(inserts.slice(i, i + 200) as never);
  }
  c.insert += inserts.length;
  return ids;
}

function need(map: Map<string, string>, ref: string): string {
  const id = map.get(ref);
  if (!id) throw new Error(`unresolved reference ${ref}`);
  return id;
}

/* ---------- Thumbnails through the existing media storage ---------- */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** course legacy_ref → thumbnail_url to set (absent = leave as it is). */
async function resolveThumbnails(tx: Tx, orgId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!mediaDir) {
    console.log("  thumbnails: no --media given — thumbnail_url left unchanged");
    return out;
  }
  const volume = process.env.MEDIA_DIR ?? "./.dev-media";
  const c = count("media_asset");
  const courses = await tx
    .select({ legacyRef: schema.offlineCourse.legacyRef, thumbnailUrl: schema.offlineCourse.thumbnailUrl })
    .from(schema.offlineCourse)
    .where(scoped(schema.offlineCourse.organizationId, orgId));
  const currentUrl = new Map(courses.map((r) => [r.legacyRef, r.thumbnailUrl]));

  for (const course of plan.courses) {
    if (!course.thumbnailFile) continue;
    // Insert-only: an existing course keeps its thumbnail (maybe uploaded from the UI).
    if (!overwrite && currentUrl.has(course.legacyRef)) continue;
    const source = path.join(mediaDir, course.thumbnailFile);
    const mimeType = MIME[path.extname(source).toLowerCase()];
    if (!existsSync(source) || !mimeType) {
      console.log(`  warning: ${course.legacyRef} thumbnail "${course.thumbnailFile}" not found or not an image`);
      continue;
    }
    const size = statSync(source).size;

    // Reuse the asset already attached when it is the same file.
    const assetId = /^\/api\/media\/([\w.-]+)$/.exec(currentUrl.get(course.legacyRef) ?? "")?.[1];
    if (assetId) {
      const [asset] = await tx
        .select()
        .from(schema.mediaAsset)
        .where(scoped(schema.mediaAsset.organizationId, orgId, eq(schema.mediaAsset.id, assetId)));
      if (
        asset?.fileName === course.thumbnailFile &&
        asset.fileSize === size &&
        existsSync(path.join(volume, orgId, assetId))
      ) {
        out.set(course.legacyRef, `/api/media/${assetId}`);
        c.noop++;
        continue;
      }
    }

    const id = newId("mediaAsset");
    if (apply) {
      // Same layout as `saveMediaFile` (src/server/whatsapp/media.ts), which
      // cannot be imported here: it validates the whole app environment.
      const target = path.join(volume, orgId, id);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, readFileSync(source));
    }
    await tx.insert(schema.mediaAsset).values({
      id,
      organizationId: orgId,
      kind: "image",
      mimeType,
      fileName: course.thumbnailFile,
      fileSize: size,
      storagePath: path.join(orgId, id),
      fetchStatus: "available",
    });
    out.set(course.legacyRef, `/api/media/${id}`);
    c.insert++;
  }
  return out;
}

/* ---------- The import ---------- */

async function run(tx: Tx, orgId: string) {
  await tx.execute(
    sql`select set_config('app.current_org', ${orgId}, true), set_config('app.current_actor', 'system:import-offline-courses', true)`
  );

  const thumbs = await resolveThumbnails(tx, orgId);
  const courseIds = await upsert(
    tx,
    "offline_course",
    schema.offlineCourse,
    "offlineCourse",
    orgId,
    plan.courses.map(({ thumbnailFile: _t, ...c }) =>
      thumbs.has(c.legacyRef) ? { ...c, thumbnailUrl: thumbs.get(c.legacyRef) } : c
    ),
    ["title", "slug", "descriptionMd", "status", ...(mediaDir ? ["thumbnailUrl"] : [])]
  );

  const lessonIds = await upsert(
    tx,
    "offline_lesson",
    schema.offlineLesson,
    "offlineLesson",
    orgId,
    plan.lessons.map(({ courseRef, ...l }) => ({ ...l, courseId: need(courseIds, courseRef) })),
    ["courseId", "title", "contentMd", "position"]
  );

  await upsert(
    tx,
    "offline_topic",
    schema.offlineTopic,
    "offlineTopic",
    orgId,
    plan.topics.map(({ lessonRef, ...t }) => ({ ...t, lessonId: need(lessonIds, lessonRef) })),
    ["lessonId", "title", "contentMd", "position", "videoUrl", "videoShown"]
  );

  const quizIds = await upsert(
    tx,
    "offline_quiz",
    schema.offlineQuiz,
    "offlineQuiz",
    orgId,
    plan.quizzes.map(({ courseRef, lessonRef, ...q }) => ({
      ...q,
      courseId: need(courseIds, courseRef),
      lessonId: lessonRef ? need(lessonIds, lessonRef) : null,
    })),
    ["courseId", "lessonId", "title", "descriptionMd", "passingPercentage", "retriesAllowed", "position"]
  );

  const questionIds = await upsert(
    tx,
    "offline_question",
    schema.offlineQuestion,
    "offlineQuestion",
    orgId,
    plan.questions.map(({ quizRef, ...q }) => ({ ...q, quizId: need(quizIds, quizRef) })),
    ["quizId", "questionMd", "answerType", "points", "position"]
  );

  const answerIds = await upsert(
    tx,
    "offline_answer",
    schema.offlineAnswer,
    "offlineAnswer",
    orgId,
    plan.answers.map(({ questionRef, ...a }) => ({ ...a, questionId: need(questionIds, questionRef) })),
    ["questionId", "text", "isCorrect", "position"]
  );

  // Stale questions/answers — ONLY with --overwrite, and ONLY inside the
  // quizzes this run re-imported. Without it, a question added or edited from
  // the UI would be deleted by the next import.
  const reimported = overwrite ? [...quizIds.values()] : [];
  if (reimported.length > 0) {
    const keepQuestions = new Set(questionIds.values());
    const keepAnswers = new Set(answerIds.values());
    const questions = await tx
      .select({ id: schema.offlineQuestion.id })
      .from(schema.offlineQuestion)
      .where(scoped(schema.offlineQuestion.organizationId, orgId, inArray(schema.offlineQuestion.quizId, reimported)));
    const staleQuestions = questions.map((r) => r.id).filter((id) => !keepQuestions.has(id));
    const answers = await tx
      .select({ id: schema.offlineAnswer.id })
      .from(schema.offlineAnswer)
      .innerJoin(schema.offlineQuestion, eq(schema.offlineQuestion.id, schema.offlineAnswer.questionId))
      .where(
        scoped(
          schema.offlineAnswer.organizationId,
          orgId,
          eq(schema.offlineQuestion.organizationId, orgId),
          inArray(schema.offlineQuestion.quizId, reimported)
        )
      );
    const staleAnswers = answers.map((r) => r.id).filter((id) => !keepAnswers.has(id));
    if (staleAnswers.length > 0) {
      await tx
        .delete(schema.offlineAnswer)
        .where(scoped(schema.offlineAnswer.organizationId, orgId, inArray(schema.offlineAnswer.id, staleAnswers)));
    }
    if (staleQuestions.length > 0) {
      await tx
        .delete(schema.offlineQuestion)
        .where(
          scoped(schema.offlineQuestion.organizationId, orgId, inArray(schema.offlineQuestion.id, staleQuestions))
        );
    }
    count("offline_answer").delete += staleAnswers.length;
    count("offline_question").delete += staleQuestions.length;
  }
}

class DryRunRollback extends Error {}

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

try {
  const orgs = await db.select({ id: schema.organization.id }).from(schema.organization);
  let orgId: string;
  if (orgArg) {
    if (!orgs.some((o) => o.id === orgArg)) throw new Error(`organization ${orgArg} not found`);
    orgId = orgArg;
  } else if (orgs.length === 1) {
    orgId = orgs[0]!.id;
  } else {
    throw new Error(`${orgs.length} organizations found — pass --org <organizationId>`);
  }
  console.log(`  organization: ${orgId}`);

  try {
    await db.transaction(async (tx) => {
      await run(tx, orgId);
      if (!apply) throw new DryRunRollback();
    });
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }

  console.log(`\n  ${"table".padEnd(18)} insert  update    kept  no-op  delete`);
  for (const [table, c] of Object.entries(counts)) {
    console.log(
      `  ${table.padEnd(18)} ${String(c.insert).padStart(6)}  ${String(c.update).padStart(6)}  ${String(c.kept).padStart(6)}  ${String(c.noop).padStart(5)}  ${String(c.delete).padStart(6)}`
    );
  }
  if (!overwrite) {
    console.log(
      "  kept = already in the database (edited from the UI or already imported), left untouched; --overwrite forces the export."
    );
  }
  console.log(
    apply
      ? "\n[offline-courses] Applied (one transaction). Attempts and access rows were not touched.\n"
      : "\n[offline-courses] Dry-run: rolled back, nothing written. Re-run with --apply.\n"
  );
} catch (e) {
  console.error(`[offline-courses] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
