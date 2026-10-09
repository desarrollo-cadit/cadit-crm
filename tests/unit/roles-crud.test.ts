import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES } from "@/lib/capabilities";

/**
 * Crear-roles — Alta, renombre y baja de roles desde `/settings/roles`.
 *
 * Lo que se prueba es lo que no tiene vuelta o abre una puerta de más:
 * - un rol nuevo no puede repetir el nombre de otro (en la pantalla de Equipo
 *   serían dos opciones idénticas y la persona elige al azar);
 * - nadie crea un rol con capacidades que no tiene (escalada);
 * - un rol con cuentas asignadas no se borra: esas cuentas quedarían con un
 *   rol sin fila y, por el respaldo en código, SIN NINGUNA capacidad;
 * - los roles de sistema no se borran nunca.
 */

const selectQueue: unknown[][] = [];
const inserts: unknown[] = [];
const updates: unknown[] = [];
const deletes: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        return { returning: () => Promise.resolve([values]) };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        updates.push(values);
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "rol_custom",
                  key: "rol_custom",
                  name: "Viejo",
                  capabilities: ["academico.ver"],
                  system: false,
                  ...(values as Record<string, unknown>),
                },
              ]),
          }),
        };
      },
    }),
    delete: () => ({
      where: (cond: unknown) => {
        deletes.push(cond);
        return { returning: () => Promise.resolve([{ id: "rol_custom" }]) };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const SEMBRADOS = [
  { id: "rol_dir", key: "direccion", name: "Dirección", capabilities: CAPABILITIES, system: true },
  { id: "rol_sop", key: "soporte", name: "Soporte", capabilities: [], system: true },
];

const CUSTOM = {
  id: "rol_custom",
  key: "rol_custom",
  name: "Coordinación académica",
  capabilities: ["academico.ver"],
  system: false,
};

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  vi.resetModules();
});

describe("createRole", () => {
  const ACADEMICO = ["academico.ver", "asistencia.editar", "evaluacion.editar", "contactos.ver"];

  it("crea un rol personalizado con una llave propia que no pisa las sembradas", async () => {
    selectQueue.push(SEMBRADOS);

    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "direccion", CAPABILITIES, {
      name: "  Coordinación académica ",
      capabilities: ACADEMICO,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe("Coordinación académica");
    expect(r.data.system).toBe(false);
    expect(r.data.memberCount).toBe(0);
    expect(r.data.capabilities).toEqual(ACADEMICO);
    // La llave no puede coincidir con un rol de sistema ni con el respaldo en
    // código (`owner`, `member`, `soporte`): un choque le heredaría permisos.
    expect(r.data.key).toMatch(/^rol_[0-9a-z]+$/);
    const fila = inserts[0] as { organizationId: string; system: boolean };
    expect(fila.organizationId).toBe("org_1");
    expect(fila.system).toBe(false);
  });

  it("descarta capacidades inventadas", async () => {
    selectQueue.push(SEMBRADOS);
    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "direccion", CAPABILITIES, {
      name: "Tutores",
      capabilities: ["academico.ver", "borrar.la.base"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.capabilities).toEqual(["academico.ver"]);
  });

  it.each([
    ["vacío", "   "],
    ["de una letra", "A"],
    ["de más de 60", "x".repeat(61)],
  ])("rechaza un nombre %s sin escribir", async (_caso, name) => {
    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "direccion", CAPABILITIES, { name, capabilities: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("invalid_name");
    expect(inserts).toHaveLength(0);
  });

  it("rechaza un nombre repetido sin mirar mayúsculas", async () => {
    selectQueue.push(SEMBRADOS);
    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "direccion", CAPABILITIES, {
      name: "SOPORTE",
      capabilities: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe("duplicate_name");
    expect(inserts).toHaveLength(0);
  });

  it("rechaza otorgar una capacidad que quien crea no tiene", async () => {
    selectQueue.push(SEMBRADOS);
    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "coordinacion", ["academico.ver", "configuracion.editar"], {
      name: "Caja",
      capabilities: ["academico.ver", "cobranza.editar"],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("escalation");
    expect(inserts).toHaveLength(0);
  });

  /**
   * Sin roles sembrados, `listRoles` muestra los de código. Un rol creado en
   * ese estado sería la ÚNICA fila y taparía a todos los demás.
   */
  it("no crea roles en una organización sin roles sembrados", async () => {
    selectQueue.push([]);
    const { createRole } = await import("@/server/roles");
    const r = await createRole("org_1", "owner", CAPABILITIES, { name: "Tutores", capabilities: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("not_seeded");
    expect(inserts).toHaveLength(0);
  });
});

describe("renameRole", () => {
  it("renombra un rol personalizado", async () => {
    selectQueue.push([CUSTOM]);
    selectQueue.push([...SEMBRADOS, CUSTOM]);
    selectQueue.push([]);
    const { renameRole } = await import("@/server/roles");
    const r = await renameRole("org_1", "rol_custom", "direccion", "Tutoría");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe("Tutoría");
    expect(updates).toHaveLength(1);
  });

  it("deja renombrar un rol de sistema: la llave, que es lo que usa el código, no cambia", async () => {
    selectQueue.push([SEMBRADOS[1]]);
    selectQueue.push([...SEMBRADOS]);
    selectQueue.push([]);
    const { renameRole } = await import("@/server/roles");
    const r = await renameRole("org_1", "rol_sop", "direccion", "Atención");
    expect(r.ok).toBe(true);
    const escrito = updates[0] as Record<string, unknown>;
    expect(escrito).not.toHaveProperty("key");
  });

  it("rechaza el nombre de OTRO rol, pero no el suyo propio con otras mayúsculas", async () => {
    selectQueue.push([CUSTOM]);
    selectQueue.push([...SEMBRADOS, CUSTOM]);
    const { renameRole } = await import("@/server/roles");
    const r = await renameRole("org_1", "rol_custom", "direccion", "dirección");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("duplicate_name");

    selectQueue.push([CUSTOM]);
    selectQueue.push([...SEMBRADOS, CUSTOM]);
    selectQueue.push([]);
    const mismo = await renameRole("org_1", "rol_custom", "direccion", "COORDINACIÓN ACADÉMICA");
    expect(mismo.ok).toBe(true);
  });

  it("rechaza un nombre inválido", async () => {
    const { renameRole } = await import("@/server/roles");
    const r = await renameRole("org_1", "rol_custom", "direccion", " ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_name");
    expect(updates).toHaveLength(0);
  });

  it("un rol inexistente responde 404", async () => {
    selectQueue.push([]);
    const { renameRole } = await import("@/server/roles");
    const r = await renameRole("org_1", "rol_x", "direccion", "Tutoría");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });
});

describe("deleteRole", () => {
  it("borra un rol personalizado que nadie tiene", async () => {
    selectQueue.push([CUSTOM]);
    selectQueue.push([]);
    const { deleteRole } = await import("@/server/roles");
    const r = await deleteRole("org_1", "rol_custom");
    expect(r.ok).toBe(true);
    expect(deletes).toHaveLength(1);
  });

  it("no borra un rol que alguna cuenta tiene asignado, y dice cuántas", async () => {
    selectQueue.push([CUSTOM]);
    selectQueue.push([{ role: "rol_custom" }, { role: "rol_custom" }]);
    const { deleteRole } = await import("@/server/roles");
    const r = await deleteRole("org_1", "rol_custom");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe("role_in_use");
    expect(r.message).toContain("2 cuentas");
    expect(deletes).toHaveLength(0);
  });

  it("no borra un rol de sistema aunque nadie lo tenga", async () => {
    selectQueue.push([SEMBRADOS[1]]);
    selectQueue.push([]);
    const { deleteRole } = await import("@/server/roles");
    const r = await deleteRole("org_1", "rol_sop");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe("system_role");
    expect(deletes).toHaveLength(0);
  });

  it("un rol inexistente responde 404", async () => {
    selectQueue.push([]);
    const { deleteRole } = await import("@/server/roles");
    const r = await deleteRole("org_1", "rol_x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });
});
