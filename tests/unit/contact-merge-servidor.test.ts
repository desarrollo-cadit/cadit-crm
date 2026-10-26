import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  datosVacios,
  planDeUnificacion,
  type ContactoAUnificar,
} from "@/lib/contact-merge";

/**
 * 2026-10-26 — Unificar contactos: el ORDEN de las escrituras.
 *
 * Postgres chequea los índices únicos sentencia por sentencia: si el que
 * queda recibe el correo del absorbido mientras el absorbido todavía lo
 * tiene, `contact_org_email_uq` revienta. Por eso el absorbido se vacía
 * PRIMERO y el que queda se completa al FINAL; y lo que choca dentro de una
 * tabla se resuelve antes de mover el resto. El borrado del absorbido va
 * después de mover todo: sus FK en cascada se llevarían lo que quedara.
 */

type Op = { kind: "update" | "delete" | "insert"; table: string; set?: Record<string, unknown> };
const ops: Op[] = [];
const sincronizadas: string[][] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          ops.push({ kind: "update", table: String(table), set });
          return [];
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        ops.push({ kind: "delete", table: String(table) });
        return [];
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        ops.push({ kind: "insert", table: String(table), set: values });
        return [];
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => {
              if (col === "toString" || col === Symbol.toPrimitive) return () => String(tableName);
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

vi.mock("@/server/group-licenses", () => ({
  sincronizarLicenciasDelGrupo: async (_org: string, ids: string[]) => {
    sincronizadas.push(ids);
    return { sinStock: [] };
  },
}));

beforeEach(() => {
  ops.length = 0;
  sincronizadas.length = 0;
});

const base: ContactoAUnificar = {
  id: "ct_x",
  firstName: "X",
  lastName: null,
  email: null,
  secondaryEmail: null,
  phone: null,
  waIdentity: "sinwa:ct_x",
  waUserId: null,
  nationalId: null,
  companyId: null,
  notes: null,
  source: null,
  utmCampaign: null,
  archivedAt: null,
  createdAt: new Date("2026-01-01Z"),
};
const patricia: ContactoAUnificar = {
  ...base,
  id: "ct_pat",
  firstName: "Patricia",
  email: "patricia@ejemplo.com",
  secondaryEmail: "pato@ejemplo.com",
  waIdentity: "sinwa:ct_pat",
  companyId: "co_1",
};
const whatsapp: ContactoAUnificar = {
  ...base,
  id: "ct_wa",
  firstName: "Patri",
  phone: "59899123456",
  waIdentity: "59899123456",
};

function planCompleto() {
  return planDeUnificacion(patricia, whatsapp, {
    ...datosVacios(),
    inscripciones: [{ id: "en_1", contactId: "ct_pat", cohortId: "co_a", grupo: "A", dependientes: 1 }],
    conversaciones: [
      { id: "cv_s", contactId: "ct_wa", isTest: false, lastInboundAt: null, lastMessageAt: null, unreadCount: 0, mensajes: 3 },
      { id: "cv_a", contactId: "ct_pat", isTest: false, lastInboundAt: null, lastMessageAt: null, unreadCount: 1, mensajes: 2 },
    ],
    accesosOffline: [
      { id: "g_a", contactId: "ct_pat", offlineCourseId: "oc", accessUntil: new Date("2026-12-01Z"), activo: true },
      { id: "g_s", contactId: "ct_wa", offlineCourseId: "oc", accessUntil: new Date("2026-11-01Z"), activo: true },
    ],
    progreso: [
      { id: "p_a", contactId: "ct_pat", topicId: "t", watchedRatio: 0.2, completedAt: null },
      { id: "p_s", contactId: "ct_wa", topicId: "t", watchedRatio: 0.5, completedAt: null },
    ],
    intentos: [
      { id: "i_s", contactId: "ct_wa", quizId: "q", attemptNumber: 1 },
      { id: "i_a", contactId: "ct_pat", quizId: "q", attemptNumber: 1 },
    ],
    reconocimientos: [
      { id: "r_a", contactId: "ct_pat", courseId: "oc", lessonId: null, activo: true },
      { id: "r_s", contactId: "ct_wa", courseId: "oc", lessonId: null, activo: true },
    ],
    historial: [
      { id: "h_s", contactId: "ct_wa", dedupKey: "ct_wa|curso:c|2021-01-01" },
      { id: "h_a", contactId: "ct_pat", dedupKey: "ct_pat|curso:c|2021-01-01" },
    ],
  });
}

const indice = (pred: (o: Op) => boolean) => {
  const i = ops.findIndex(pred);
  expect(i, "falta una escritura esperada").toBeGreaterThanOrEqual(0);
  return i;
};
const moverDe = (table: string) => (o: Op) =>
  o.kind === "update" &&
  o.table === table &&
  o.set?.contactId === "ct_wa" &&
  Object.keys(o.set).every((k) => k === "contactId" || k === "updatedAt");

describe("aplicarUnificacion — el orden de las escrituras", () => {
  it("vacía correo, secundario y teléfono del absorbido ANTES de completar al que queda", async () => {
    const { aplicarUnificacion } = await import("@/server/contact-merge");
    const plan = planCompleto();
    expect(plan.bloqueos).toEqual([]);
    await aplicarUnificacion("org_1", "usr_1", plan);

    expect(ops[0]).toEqual({
      kind: "update",
      table: "contact",
      set: expect.objectContaining({ email: null, secondaryEmail: null, phone: null }),
    });
    const completar = indice(
      (o) => o.kind === "update" && o.table === "contact" && o.set?.email === "patricia@ejemplo.com"
    );
    expect(ops[completar]!.set).toMatchObject({ secondaryEmail: "pato@ejemplo.com" });
    // La empresa: por la regla de siempre (solo si está vacía), después del contacto.
    const empresa = indice((o) => o.kind === "update" && o.table === "contact" && o.set?.companyId === "co_1");
    expect(empresa).toBeGreaterThan(completar);
  });

  it("lo que choca se resuelve antes de mover el resto", async () => {
    const { aplicarUnificacion } = await import("@/server/contact-merge");
    await aplicarUnificacion("org_1", "usr_1", planCompleto());

    const revocarAcceso = indice((o) => o.table === "offlineCourseGrant" && o.set?.revokedAt instanceof Date);
    expect(revocarAcceso).toBeLessThan(indice(moverDe("offlineCourseGrant")));

    const borrarProgreso = indice((o) => o.kind === "delete" && o.table === "offlineTopicProgress");
    expect(borrarProgreso).toBeLessThan(indice(moverDe("offlineTopicProgress")));

    const renumerar = indice((o) => o.table === "offlineQuizAttempt" && o.set?.attemptNumber === 2);
    expect(renumerar).toBeLessThan(indice(moverDe("offlineQuizAttempt")));

    const revocarReconocimiento = indice((o) => o.table === "offlineRecognition" && o.set?.revokedAt instanceof Date);
    expect(revocarReconocimiento).toBeLessThan(indice(moverDe("offlineRecognition")));

    // El historial que chocaba se borra; nada se reclava (la única fila chocaba).
    indice((o) => o.kind === "delete" && o.table === "historicalCourseTaking");
  });

  it("une las conversaciones: mueve mensajes y derivaciones y borra la vacía", async () => {
    const { aplicarUnificacion } = await import("@/server/contact-merge");
    await aplicarUnificacion("org_1", "usr_1", planCompleto());
    const mensajes = indice((o) => o.table === "message" && o.set?.conversationId === "cv_s");
    const derivaciones = indice((o) => o.table === "areaHandoff" && o.set?.conversationId === "cv_s");
    const borrar = indice((o) => o.kind === "delete" && o.table === "conversation");
    expect(mensajes).toBeLessThan(borrar);
    expect(derivaciones).toBeLessThan(borrar);
    const totales = indice((o) => o.table === "conversation" && o.set?.unreadCount === 1);
    expect(totales).toBeLessThan(borrar);
  });

  it("borra al absorbido DESPUÉS de mover todo, deja la nota y sincroniza licencias", async () => {
    const { aplicarUnificacion } = await import("@/server/contact-merge");
    await aplicarUnificacion("org_1", "usr_1", planCompleto());
    const borrar = indice((o) => o.kind === "delete" && o.table === "contact");
    for (const tabla of [
      "enrollment",
      "conversation",
      "accountLink",
      "offlineCourseGrant",
      "offlineTopicProgress",
      "offlineQuizAttempt",
      "offlineRecognition",
      "activityLog",
      "contactActivity",
      "contactFormSubmission",
      "marketingCampaignRecipient",
      "marketingUnsubscribe",
      "areaHandoff",
      "staffNotice",
    ]) {
      expect(indice(moverDe(tabla)), tabla).toBeLessThan(borrar);
    }
    const nota = indice((o) => o.kind === "insert" && o.table === "contactActivity");
    expect(nota).toBeGreaterThan(borrar);
    expect(ops[nota]!.set).toMatchObject({ contactId: "ct_wa", kind: "nota" });
    expect(String(ops[nota]!.set!.body)).toMatch(/^Unificado con Patricia/);
    expect(sincronizadas).toEqual([["en_1"]]);
  });

  it("con un bloqueo LANZA y no escribe nada", async () => {
    const { aplicarUnificacion, UnificacionBloqueada } = await import("@/server/contact-merge");
    const plan = planDeUnificacion(patricia, whatsapp, {
      ...datosVacios(),
      cuentasDelPortal: [
        { id: "al_1", contactId: "ct_pat" },
        { id: "al_2", contactId: "ct_wa" },
      ],
    });
    await expect(aplicarUnificacion("org_1", "usr_1", plan)).rejects.toBeInstanceOf(UnificacionBloqueada);
    expect(ops).toEqual([]);
  });

  it("si falta elegir los correos, LANZA y no escribe nada", async () => {
    const { aplicarUnificacion } = await import("@/server/contact-merge");
    const plan = planDeUnificacion(
      { ...patricia, email: "c@x.com", secondaryEmail: "d@x.com" },
      { ...whatsapp, email: "a@x.com" },
      datosVacios()
    );
    expect(plan.correos.faltaElegir).toBe(true);
    await expect(aplicarUnificacion("org_1", "usr_1", plan)).rejects.toThrow();
    expect(ops).toEqual([]);
  });
});

/**
 * Toda tabla con FK a `contact.id` tiene que estar contemplada: las de
 * `cascade` se borrarían junto con el absorbido, y las de `set null`
 * quedarían huérfanas de su persona.
 */
describe("ninguna tabla que apunta a contact queda afuera", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
  const schemaSrc = leer("src/lib/db/schema.ts");
  const servidor = leer("src/server/contact-merge.ts");
  const bloques = schemaSrc.split(/\nexport const /).slice(1);
  const conContacto = bloques
    .filter((b) => /= pgTable\(/.test(b.split("\n")[0] ?? "") && b.includes("references(() => contact.id"))
    .map((b) => /^(\w+)/.exec(b)![1]!);

  it("encuentra las tablas (sanidad del parser)", () => {
    expect(conContacto).toContain("enrollment");
    expect(conContacto).toContain("historicalCourseTaking");
    expect(conContacto.length).toBeGreaterThanOrEqual(15);
  });

  it.each(conContacto)("%s se mueve en src/server/contact-merge.ts", (tabla) => {
    expect(servidor).toContain(`schema.${tabla}`);
  });
});
