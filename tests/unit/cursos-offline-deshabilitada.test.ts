import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contactsToSnapshot,
  courseProgressState,
  enabledOutline,
  topicOpenFor,
  type CourseProgressInput,
} from "@/server/offline-courses/logic";
import { lessonPatchSchema, topicPatchSchema } from "@/server/offline-courses/editor-logic";

/**
 * cursos-offline — Deshabilitar una lección o un tema (por ejemplo, un video que
 * no anda) sin borrarlo.
 *
 * Tres promesas:
 *  1. Lo deshabilitado no se ve, no bloquea el tema siguiente y no cuenta para
 *     completar el curso.
 *  2. Quien ya terminó el curso lo conserva al volver a habilitar: lo que no
 *     hizo pasa a ser opcional.
 *  3. Quien NO terminó lo ve como un tema normal otra vez.
 */

const lessons = [
  { id: "L1", disabled: false },
  { id: "L2", disabled: false },
  { id: "L3", disabled: false },
];
const topics = [
  { id: "t1", lessonId: "L1", disabled: false },
  { id: "t2", lessonId: "L1", disabled: false },
  { id: "t3", lessonId: "L2", disabled: false },
  { id: "t4", lessonId: "L2", disabled: false },
];

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("enabledOutline — qué ve el alumno", () => {
  it("sin nada deshabilitado devuelve todo, en el mismo orden", () => {
    const out = enabledOutline(lessons, topics);
    expect(ids(out.lessons)).toEqual(["L1", "L2", "L3"]);
    expect(ids(out.topics)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("un tema deshabilitado sale solo", () => {
    const out = enabledOutline(
      lessons,
      topics.map((t) => (t.id === "t2" ? { ...t, disabled: true } : t))
    );
    expect(ids(out.topics)).toEqual(["t1", "t3", "t4"]);
    expect(ids(out.lessons)).toContain("L1");
  });

  it("una lección deshabilitada se lleva todos sus temas", () => {
    const out = enabledOutline(
      lessons.map((l) => (l.id === "L2" ? { ...l, disabled: true } : l)),
      topics
    );
    expect(ids(out.lessons)).toEqual(["L1", "L3"]);
    expect(ids(out.topics)).toEqual(["t1", "t2"]);
  });

  it("una lección con todos sus temas deshabilitados no queda vacía a la vista", () => {
    const out = enabledOutline(
      lessons,
      topics.map((t) => (t.lessonId === "L2" ? { ...t, disabled: true } : t))
    );
    expect(ids(out.lessons)).toEqual(["L1", "L3"]);
  });

  it("una lección que nunca tuvo temas se conserva (puede traer un cuestionario)", () => {
    expect(ids(enabledOutline(lessons, topics).lessons)).toContain("L3");
  });
});

const input = (over: Partial<CourseProgressInput> = {}): CourseProgressInput => ({
  topics: topics.map(({ id, lessonId }) => ({ id, lessonId })),
  quizzes: [],
  completedTopicIds: [],
  passedQuizIds: [],
  recognitions: [],
  ...over,
});

describe("lo deshabilitado no frena ni cuenta", () => {
  // t3 está deshabilitado: el curso que ve el alumno es t1, t2, t4.
  const visible = enabledOutline(
    lessons,
    topics.map((t) => (t.id === "t3" ? { ...t, disabled: true } : t))
  ).topics.map(({ id, lessonId }) => ({ id, lessonId }));

  it("el tema siguiente a uno deshabilitado se abre al terminar el anterior", () => {
    const state = courseProgressState(input({ topics: visible, completedTopicIds: ["t1", "t2"] }));
    expect(state.orderedTopicIds).toEqual(["t1", "t2", "t4"]);
    expect(topicOpenFor(state, "t4")).toBe(true);
  });

  it("se completa el curso sin el tema deshabilitado", () => {
    const state = courseProgressState(input({ topics: visible, completedTopicIds: ["t1", "t2", "t4"] }));
    expect(state.completion).toMatchObject({ topicsDone: 3, topicsTotal: 3, completed: true });
  });

  it("un tema deshabilitado ya hecho no suma al avance", () => {
    const state = courseProgressState(input({ topics: visible, completedTopicIds: ["t1", "t3"] }));
    expect(state.completion).toMatchObject({ topicsDone: 1, topicsTotal: 3, completed: false });
  });
});

describe("quien ya terminó el curso lo conserva (nunca retrocede)", () => {
  const sinT3 = input({
    topics: [
      { id: "t1", lessonId: "L1" },
      { id: "t2", lessonId: "L1" },
      { id: "t4", lessonId: "L2" },
    ],
    completedTopicIds: ["t1", "t2", "t4"],
  });

  it("control: SIN la anotación, habilitar t3 le quita el curso", () => {
    const con = courseProgressState(input({ completedTopicIds: ["t1", "t2", "t4"] }));
    expect(con.completion.completed).toBe(false);
  });

  it("con la anotación sigue completado, y t3 es opcional", () => {
    // Antes de habilitar t3, el curso estaba completo → se anota.
    expect(courseProgressState(sinT3).completion.completed).toBe(true);
    const despues = courseProgressState(input({ completedTopicIds: ["t1", "t2", "t4"], completedBefore: true }));
    expect(despues.completion.completed).toBe(true);
    expect([...despues.optionalTopicIds]).toEqual(["t3"]);
  });

  it("el avance no dice '3 de 4' junto a 'completado': el opcional no entra en el total", () => {
    const despues = courseProgressState(input({ completedTopicIds: ["t1", "t2", "t4"], completedBefore: true }));
    expect(despues.completion).toMatchObject({ topicsDone: 3, topicsTotal: 3, completed: true });
  });

  it("todos los temas quedan abiertos: un opcional no bloquea a otro", () => {
    const despues = courseProgressState(input({ completedTopicIds: ["t1"], completedBefore: true }));
    for (const id of ["t1", "t2", "t3", "t4"]) expect(topicOpenFor(despues, id), id).toBe(true);
  });

  it("si lo hace, deja de ser opcional y cuenta", () => {
    const hecho = courseProgressState(
      input({ completedTopicIds: ["t1", "t2", "t3", "t4"], completedBefore: true })
    );
    expect(hecho.optionalTopicIds.size).toBe(0);
    expect(hecho.completion).toMatchObject({ topicsDone: 4, topicsTotal: 4, completed: true });
  });

  it("un tema fuera del curso sigue cerrado", () => {
    const despues = courseProgressState(input({ completedBefore: true }));
    expect(topicOpenFor(despues, "otro")).toBe(false);
  });
});

describe("quien NO terminó lo ve como obligatorio otra vez", () => {
  it("el tema vuelve a ser requerido y respeta el orden", () => {
    const state = courseProgressState(input({ completedTopicIds: ["t1"] }));
    expect(state.optionalTopicIds.size).toBe(0);
    expect(state.completion).toMatchObject({ topicsDone: 1, topicsTotal: 4, completed: false });
    expect(topicOpenFor(state, "t3")).toBe(false);
    expect(topicOpenFor(state, "t2")).toBe(true);
  });
});

describe("contactsToSnapshot — a quién se anota al habilitar", () => {
  const visible = [
    { id: "t1", lessonId: "L1" },
    { id: "t2", lessonId: "L1" },
  ];
  const quizzes = [{ id: "q1", lessonId: null }];
  const termino = { completedTopicIds: ["t1", "t2"], passedQuizIds: ["q1"], recognitions: [] };

  it("anota a quien cumple el curso con los temas de ahora", () => {
    const out = contactsToSnapshot({
      topics: visible,
      quizzes,
      candidates: [
        { contactId: "ana", ...termino },
        { contactId: "beto", completedTopicIds: ["t1"], passedQuizIds: ["q1"], recognitions: [] },
        { contactId: "cris", completedTopicIds: ["t1", "t2"], passedQuizIds: [], recognitions: [] },
      ],
      alreadySnapshot: [],
    });
    expect(out).toEqual(["ana"]);
  });

  it("no repite a quien ya estaba anotado", () => {
    const out = contactsToSnapshot({
      topics: visible,
      quizzes,
      candidates: [{ contactId: "ana", ...termino }],
      alreadySnapshot: ["ana"],
    });
    expect(out).toEqual([]);
  });

  it("un reconocimiento del curso cuenta como haberlo terminado", () => {
    const out = contactsToSnapshot({
      topics: visible,
      quizzes,
      candidates: [
        {
          contactId: "dora",
          completedTopicIds: [],
          passedQuizIds: [],
          recognitions: [{ lessonId: null, revokedAt: null }],
        },
      ],
      alreadySnapshot: [],
    });
    expect(out).toEqual(["dora"]);
  });

  it("un curso sin nada habilitado no anota a nadie (no hay nada que afirmar)", () => {
    const out = contactsToSnapshot({
      topics: [],
      quizzes: [],
      candidates: [{ contactId: "ana", ...termino }],
      alreadySnapshot: [],
    });
    expect(out).toEqual([]);
  });
});

describe("el editor acepta `disabled` y nada más", () => {
  it("lección y tema aceptan true y false", () => {
    expect(lessonPatchSchema.safeParse({ disabled: true }).success).toBe(true);
    expect(lessonPatchSchema.safeParse({ disabled: false }).success).toBe(true);
    expect(topicPatchSchema.safeParse({ disabled: true }).success).toBe(true);
  });

  it("rechaza un valor que no es booleano y los campos desconocidos", () => {
    expect(lessonPatchSchema.safeParse({ disabled: "si" }).success).toBe(false);
    expect(topicPatchSchema.safeParse({ disabled: 1 }).success).toBe(false);
    expect(topicPatchSchema.safeParse({ disabledAt: "2026-01-01" }).success).toBe(false);
  });
});

/* ============================================================
 * Guardas de estructura
 * ============================================================ */

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("la regla está en el servidor, no solo en la pantalla", () => {
  it("la lectura compartida arma el curso del alumno SIN lo deshabilitado", () => {
    const codigo = sinComentarios(read("src", "server", "offline-courses", "outline.ts"));
    expect(codigo).toContain("enabledOutline(");
    expect(codigo).toContain("completedBefore:");
  });

  it("el alumno abre y reporta avance solo por el gate compartido (un tema apagado responde 404)", () => {
    for (const file of ["student.ts", "progress.ts"]) {
      const codigo = sinComentarios(read("src", "server", "offline-courses", file));
      expect(codigo, file).toContain("topicOpenFor(");
      expect(codigo, file).not.toContain("topicUnlocked(");
      // El outline del alumno nunca pide lo deshabilitado.
      expect(codigo, file).not.toContain("includeDisabled");
    }
  });

  it("habilitar anota a quien terminó ANTES de escribir el cambio", () => {
    const codigo = sinComentarios(read("src", "server", "offline-courses", "editor.ts"));
    for (const fn of ["updateLesson", "updateTopic"]) {
      const cuerpo = codigo.slice(codigo.indexOf(`export async function ${fn}(`));
      const anotar = cuerpo.indexOf("snapshotCompletedContacts(");
      const escribir = cuerpo.indexOf(".update(");
      expect(anotar, `${fn} anota`).toBeGreaterThan(-1);
      expect(anotar, `${fn} anota antes de escribir`).toBeLessThan(escribir);
    }
  });

  it("la anotación solo inserta: nunca actualiza ni borra lo que ya terminó alguien", () => {
    const codigo = sinComentarios(read("src", "server", "offline-courses", "completion-snapshot.ts"));
    expect(codigo).toContain(".insert(offlineCourseCompletion)");
    expect(codigo).not.toMatch(/\.(update|delete)\(/);
  });

  it("la migración crea la tabla con su política de aislamiento y las columnas son nulas", () => {
    const sql = read("drizzle", "0092_leccion_offline_deshabilitada.sql");
    expect(sql).toMatch(/offline_course_completion[\s\S]*enable row level security/);
    expect(sql).toContain("create policy tenant_isolation on \"offline_course_completion\"");
    expect(sql).toMatch(/offline_lesson" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;/);
    expect(sql).toMatch(/offline_topic" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;/);
    expect(sql).not.toMatch(/disabled_at" timestamp (NOT NULL|DEFAULT)/i);
  });

  it("unificar contactos mueve lo que terminó el absorbido", () => {
    expect(read("src", "server", "contact-merge.ts")).toContain("schema.offlineCourseCompletion");
  });
});
