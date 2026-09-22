import { beforeEach, describe, expect, it, vi } from "vitest";
import { findClashes, resolveMeetingUrl, toOccupiedSlots } from "@/server/virtual-rooms";

/**
 * 023 US5 — Mover UNA clase a otra aula, sin tocar el resto de la cohorte.
 *
 * `class_session.virtual_room_id` existía desde la fase 023 y ninguna ruta lo
 * escribía: la excepción por clase era una columna que nadie podía usar. Por
 * eso este camino tampoco tenía prueba de comportamiento.
 *
 * Las dos reglas que un camino de escritura nuevo puede romper sin hacer
 * ruido, y que se fijan acá:
 *
 * 1. **FR-009 — un aula dada de baja no se asigna a nada nuevo.** El agujero
 *    se cerró para las cohortes en `validateCohortForeignKeys`; una segunda
 *    puerta que no lo aplique lo reabre. La regla es UNA sola función, no dos
 *    copias que un día divergen.
 * 2. **025 (FR-004) — el aula no aporta enlace.** La cadena es
 *    `clase → cohorte`, y asignarle un aula a una clase no puede mover el
 *    enlace que ve el alumno. Es exactamente el bug que la 025 vino a
 *    arreglar: el aula es el RECURSO OCUPADO, nunca una fuente de URL.
 */

/* ============================================================
 * El doble de base: cola posicional, como el resto de tests/unit
 * ============================================================ */

const selectQueue: unknown[][] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
/** Qué devuelve cada `returning()`; vacío = la fila no existe (404). */
const updateReturning: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

function updateChain(table: string, set: Record<string, unknown>) {
  updates.push({ table, set });
  const filas = updateReturning.shift() ?? [{ id: "cls_1", ...set }];
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = async () => filas;
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => updateChain(String(table), s),
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
              if (col === "toString" || col === Symbol.toPrimitive) {
                return () => String(tableName);
              }
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  updateReturning.length = 0;
  vi.resetModules();
});

const ARCHIVADA = new Date("2026-01-01T00:00:00.000Z");

describe("023 US5 — el aula de UNA clase", () => {
  it("asigna el aula y escribe SÓLO esa columna sobre la clase", async () => {
    selectQueue.push([{ id: "vr_b", archivedAt: null }]); // el aula pedida

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_1", "vr_b");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe("classSession");
    expect(updates[0]!.set.virtualRoomId).toBe("vr_b");
  });

  /**
   * FR-009 — el front oculta el aula de baja; esto es lo que la prohíbe cuando
   * el id llega por la API. Sin esto, la puerta nueva reabre el agujero que se
   * cerró para las cohortes.
   */
  it("rechaza un aula dada de baja, y no escribe nada", async () => {
    selectQueue.push([{ id: "vr_a", archivedAt: ARCHIVADA }]); // el aula pedida
    selectQueue.push([{ virtualRoomId: "vr_b" }]); // la que la clase tiene hoy

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_1", "vr_a");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.message).toContain("baja");
    }
    expect(updates).toHaveLength(0);
  });

  /**
   * La otra mitad de FR-009: **lo que ya la tenía la conserva.** Reenviar el
   * aula que la clase ya tiene no es asignarla a algo nuevo, y bloquearlo
   * dejaría una clase que no se puede editar.
   */
  it("deja reenviar el aula que la clase YA tenía antes de la baja", async () => {
    selectQueue.push([{ id: "vr_a", archivedAt: ARCHIVADA }]);
    selectQueue.push([{ virtualRoomId: "vr_a" }]); // la misma

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_1", "vr_a");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("rechaza un aula que no existe en la organización", async () => {
    selectQueue.push([]); // ninguna fila: no es de esta organización

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_1", "vr_de_otra_org");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
    expect(updates).toHaveLength(0);
  });

  /** Quitar la excepción devuelve la clase a la herencia de su cohorte (FR-002). */
  it("quitar el aula (null) no consulta ninguna aula y escribe null", async () => {
    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_1", null);

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set.virtualRoomId).toBeNull();
    // Ninguna consulta: no había aula que validar.
    expect(selectQueue).toHaveLength(0);
  });

  it("una clase inexistente responde 404", async () => {
    selectQueue.push([{ id: "vr_b", archivedAt: null }]);
    updateReturning.push([]); // el UPDATE no alcanzó ninguna fila

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    const r = await assignClassRoom("org_1", "cls_inexistente", "vr_b");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  /**
   * 025 (FR-004) — **El bug que la 025 vino a arreglar, cerrado por test.**
   *
   * El aula es la CUENTA de Zoom y su sala es compartida. Si asignar un aula
   * tocara el enlace de la clase —o lo agregara a la cadena— dos cohortes de
   * la misma cuenta volverían a caer en la misma sala, y el alumno de una
   * entraría a la clase de la otra.
   */
  it("asignar un aula NO toca el enlace de la reunión", async () => {
    selectQueue.push([{ id: "vr_b", archivedAt: null }]);

    const { assignClassRoom } = await import("@/server/virtual-rooms");
    await assignClassRoom("org_1", "cls_1", "vr_b");

    const columnas = Object.keys(updates[0]!.set);
    expect(columnas).toContain("virtualRoomId");
    expect(columnas).not.toContain("meetingUrl");
    expect(columnas).not.toContain("recordingUrl");
  });
});

describe("023/025 — el aula de la clase y el enlace son cosas distintas", () => {
  /**
   * La cadena sigue siendo de DOS escalones con el aula asignada por clase:
   * enlace de la clase → enlace de la cohorte → nada. El aula no entra ni como
   * último recurso.
   */
  it("una clase con aula propia y sin enlace sigue sin enlace", () => {
    expect(
      resolveMeetingUrl({ classMeetingUrl: null, cohortMeetingUrl: null })
    ).toBeNull();
  });

  it("y con la cohorte cargada, el enlace es el de la COHORTE, no el del aula", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: null,
        cohortMeetingUrl: "https://zoom.us/j/cohorte",
      })
    ).toBe("https://zoom.us/j/cohorte");
  });
});

describe("023 US5 — los choques después de mover UNA clase", () => {
  const dia = new Date("2026-09-07T00:00:00Z");
  const clase = (
    id: string,
    cohortId: string,
    startTime: string,
    endTime: string,
    virtualRoomId: string | null
  ) => ({
    id,
    cohortId,
    date: dia,
    startTime,
    endTime,
    canceledAt: null as Date | null,
    virtualRoomId,
    cohortVirtualRoomId: "zoom1" as string | null,
  });

  /**
   * US5 — "los choques se resuelven de a una". Dos clases de cohortes
   * distintas se pisan en el aula heredada; mover UNA a otra aula tiene que
   * sacar ese choque y dejar intacto el resto de la cohorte.
   */
  it("mover una sola clase a otra aula le saca el choque, sin tocar sus hermanas", () => {
    const heredando = [
      clase("x1", "cohX", "18:30", "20:30", null),
      clase("y1", "cohY", "18:00", "19:30", null),
      clase("x2", "cohX", "21:00", "22:00", null),
    ];
    expect(findClashes(toOccupiedSlots(heredando, "America/Montevideo"))).toHaveLength(1);

    const conExcepcion = [
      clase("x1", "cohX", "18:30", "20:30", "zoom2"),
      clase("y1", "cohY", "18:00", "19:30", null),
      clase("x2", "cohX", "21:00", "22:00", null),
    ];
    const slots = toOccupiedSlots(conExcepcion, "America/Montevideo");
    expect(findClashes(slots)).toEqual([]);
    // La hermana no se movió: sigue en el aula de la cohorte.
    expect(slots.find((s) => s.classSessionId === "x2")!.virtualRoomId).toBe("zoom1");
  });

  /** Y mover una clase ENCIMA de otra crea el choque, que es lo que hay que avisar. */
  it("moverla a un aula ya ocupada crea el choque, y se reporta", () => {
    const clases = [
      clase("x1", "cohX", "18:30", "20:30", "zoom2"),
      clase("y1", "cohY", "18:00", "19:30", "zoom2"),
    ];
    const clashes = findClashes(toOccupiedSlots(clases, "America/Montevideo"));
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.roomId).toBe("zoom2");
  });
});
