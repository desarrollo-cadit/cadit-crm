import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CAPABILITIES,
  FINANCIAL_CAPABILITIES,
  ROLE_CAPABILITIES,
  SYSTEM_ROLES,
  type Capability,
} from "@/lib/capabilities";

/**
 * 040 — El rol Ventas: ve todo lo académico, en lectura, y SIN PLATA.
 *
 * "Sin plata" no se cumple escondiendo columnas en la pantalla: se cumple
 * porque el dato no viaja (constitución I). Este archivo fija las tres cosas
 * que lo garantizan y que se rompen sin hacer ruido:
 *
 * 1. el rol no tiene ninguna capacidad financiera;
 * 2. el DTO del roster, armado con sus capacidades, no trae montos;
 * 3. ninguna ruta que sus capacidades abren escribe (salvo empresas) ni
 *    importa un módulo financiero.
 */

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({}),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const ventas = SYSTEM_ROLES.find((r) => r.key === "ventas");

describe("040 — el rol `ventas`", () => {
  it("está sembrado como rol de sistema, con nombre en castellano", () => {
    expect(ventas, "`ventas` no está en SYSTEM_ROLES").toBeDefined();
    expect(ventas!.name).toBe("Ventas");
  });

  it("lleva exactamente sus ocho capacidades", () => {
    expect([...ventas!.capabilities].sort()).toEqual(
      [
        "academico.ver",
        "asistencia.ver",
        "evaluacion.ver",
        "contactos.ver",
        "inscripciones.ver",
        "empresas.editar",
        // 045 (P-02) — arma audiencias y campañas, y las envía.
        "marketing.ver",
        "marketing.enviar",
      ].sort()
    );
  });

  /**
   * 045 (FR-025, P-02) — Ventas ve y envía campañas sin aprobación previa, pero
   * no configura el buzón ni revierte bajas: eso es de quien dirige.
   */
  it("045 — ve y envía campañas, pero no configura marketing", () => {
    expect(ventas!.capabilities).toContain("marketing.ver");
    expect(ventas!.capabilities).toContain("marketing.enviar");
    expect(ventas!.capabilities).not.toContain("marketing.configurar");
  });

  it("no tiene NINGUNA capacidad financiera ni de cobranza", () => {
    for (const c of ventas!.capabilities) {
      expect(FINANCIAL_CAPABILITIES, `ventas tiene ${c}`).not.toContain(c);
      expect(c.startsWith("cobranza."), `ventas tiene ${c}`).toBe(false);
    }
  });

  it("todo lo suyo es de lectura, salvo editar empresas y enviar campañas", () => {
    const escrituras = ventas!.capabilities.filter((c) => !c.endsWith(".ver"));
    expect([...escrituras].sort()).toEqual(["empresas.editar", "marketing.enviar"].sort());
  });

  it("no confirma cohortes ni sigue inscripciones (checklist, correos, mover leads)", () => {
    expect(ventas!.capabilities).not.toContain("cohortes.confirmar");
    expect(ventas!.capabilities).not.toContain("inscripciones.seguimiento");
    // 042 — tampoco registra facturas ni recibos.
    expect(ventas!.capabilities).not.toContain("facturacion.editar");
  });

  it("no entra en el respaldo de código (existe por su fila, como dirección)", () => {
    expect(Object.keys(ROLE_CAPABILITIES)).not.toContain("ventas");
  });
});

describe("040 — las capacidades nuevas", () => {
  const byKey = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!;

  it("están en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("empresas.editar");
    expect(CAPABILITIES).toContain("inscripciones.seguimiento");
  });

  it("`empresas.editar`: dirección, coordinación, administración y ventas; soporte no", () => {
    for (const key of ["direccion", "coordinacion", "administracion", "ventas"]) {
      expect(byKey(key).capabilities, key).toContain("empresas.editar");
    }
    expect(byKey("soporte").capabilities).not.toContain("empresas.editar");
    expect(ROLE_CAPABILITIES.soporte).not.toContain("empresas.editar");
  });

  /**
   * DV-001 — Nadie pierde nada: todo rol de sistema que tenía
   * `inscripciones.ver` (y con ella escribía) recibe `inscripciones.seguimiento`.
   * La única excepción es ventas, que es la razón de ser de la partición.
   */
  it("`inscripciones.seguimiento` la tiene todo rol con `inscripciones.ver`, menos ventas", () => {
    for (const r of SYSTEM_ROLES) {
      if (r.key === "ventas") continue;
      if (r.capabilities.includes("inscripciones.ver")) {
        expect(r.capabilities, r.key).toContain("inscripciones.seguimiento");
      }
    }
    expect(ROLE_CAPABILITIES.soporte).toContain("inscripciones.seguimiento");
  });
});

describe("040 — la plata no viaja al rol Ventas", () => {
  /** Las llaves de plata del roster: hoy solo con `cobranza.ver` (FR-016 de 005). */
  const LLAVES_DE_PLATA = [
    "amount",
    "currency",
    "installments",
    "paymentNotes",
    "nationalId",
    "invoiceNumber",
    "receiptNumber",
    "sellerId",
    "seller",
    "sellerRequired",
    "companyId",
  ];

  it("`buildRosterEntry` con las capacidades de Ventas no arma ninguna llave de plata", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      ventas!.capabilities,
      {
        id: "enr_1",
        amount: 7600000,
        currency: "UYU",
        installments: 12,
        paymentNotes: "pagó la mitad",
        nationalId: "1.234.567-8",
        invoiceNumber: "819",
        receiptNumber: "77",
        sellerId: "sel_1",
        companyId: "cia_1",
        termsEmailSentAt: null,
        softwareInstalledAt: null,
        hadOwnLicense: false,
        academiaOnlineAccessAt: null,
        welcomeEmailSentAt: null,
      } as never,
      {
        id: "ct_1",
        firstName: "Diego",
        lastName: "Fernández",
        phone: "59899123456",
        email: "diego@example.com",
        archivedAt: null,
      } as never,
      null,
      null,
      { id: "sel_1", name: "Valeria", archivedAt: null }
    );
    for (const llave of LLAVES_DE_PLATA) {
      expect(Object.keys(entry), `viajó ${llave}`).not.toContain(llave);
    }
    expect(JSON.stringify(entry)).not.toContain("76000");
    expect(JSON.stringify(entry)).not.toContain("819");
  });

  /**
   * Los armadores de DTO que leen columnas de plata y que estas capacidades
   * alcanzan. Cada uno decide con `cobranza.ver` si la arma: si alguien quita
   * esa pregunta, la plata le llega a soporte, a administración sin cobranza
   * y a Ventas a la vez.
   */
  it.each([
    "src/server/enrollments.ts",
    "src/server/student-record.ts",
    "src/server/workshops.ts",
  ])("%s decide la plata con `cobranza.ver`", (archivo) => {
    expect(readFileSync(path.join(process.cwd(), archivo), "utf8")).toContain('"cobranza.ver"');
  });
});

/* ============================================================
 * Las rutas que abren sus capacidades
 * ============================================================ */

const API_DIR = path.join(process.cwd(), "src", "app", "api");

function findRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return findRoutes(full);
    return entry === "route.ts" ? [full] : [];
  });
}

const rel = (f: string) => path.relative(API_DIR, f).replace(/\\/g, "/");

type Puerta = { ruta: string; metodo: string; capacidad: Capability; src: string };

const PUERTAS: Puerta[] = findRoutes(API_DIR).flatMap((file) => {
  const src = readFileSync(file, "utf8");
  return [
    ...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*requireCapability\(\s*"([^"]+)"/g),
  ].map((m) => ({ ruta: rel(file), metodo: m[1]!, capacidad: m[2] as Capability, src }));
});

/** Los módulos que hablan de plata: cuotas, pagos, cierre, ventas por vendedor. */
const MODULOS_DE_PLATA = [
  "@/server/billing",
  "@/server/billing-bulk",
  "@/server/finance",
  "@/server/finanzas-periodo",
  "@/server/ventas-por-vendedor",
  // 042 — la pantalla de facturación y sus dos escrituras.
  "@/server/facturacion",
];

describe("040 — lo que el rol Ventas puede llamar", () => {
  const suyas = PUERTAS.filter((p) => ventas!.capabilities.includes(p.capacidad));

  it("encuentra las rutas (el test no está mirando un árbol vacío)", () => {
    expect(suyas.length).toBeGreaterThan(40);
  });

  /**
   * 045 — Las escrituras de marketing (`marketing.enviar`) viven solo bajo
   * `api/marketing/`: audiencias, campañas e imágenes, nunca datos de cursada
   * ni de plata.
   */
  it("045 — sus escrituras de marketing viven solo bajo `api/marketing/`", () => {
    const deMarketing = suyas.filter((p) => p.capacidad === "marketing.enviar");
    for (const p of deMarketing) {
      expect(p.ruta.startsWith("marketing/"), `${p.metodo} ${p.ruta}`).toBe(true);
    }
  });

  it("no escribe en ningún lado salvo en empresas (y en marketing)", () => {
    const escrituras = suyas
      .filter((p) => p.metodo !== "GET" && p.capacidad !== "marketing.enviar")
      .map((p) => `${p.metodo} ${p.ruta} (${p.capacidad})`);
    expect(escrituras.sort()).toEqual(
      ["PATCH companies/[id]/route.ts (empresas.editar)", "POST companies/route.ts (empresas.editar)"].sort()
    );
  });

  it("ninguna de sus rutas importa un módulo de plata", () => {
    const conPlata = suyas
      .filter((p) => MODULOS_DE_PLATA.some((m) => p.src.includes(`"${m}"`)))
      .map((p) => p.ruta);
    expect(conPlata).toEqual([]);
  });

  /**
   * DV-001 — Las cuatro escrituras que vivían bajo `inscripciones.ver` ahora
   * declaran `inscripciones.seguimiento`.
   */
  it.each([
    ["PATCH", "pipeline/leads/[id]/route.ts"],
    ["PATCH", "enrollments/[id]/checklist/route.ts"],
    ["POST", "enrollments/[id]/emails/route.ts"],
    ["POST", "cohorts/[id]/emails/bulk/route.ts"],
  ])("%s %s exige `inscripciones.seguimiento`", (metodo, ruta) => {
    const p = PUERTAS.find((x) => x.ruta === ruta && x.metodo === metodo);
    expect(p, `${metodo} ${ruta} no declara capacidad`).toBeDefined();
    expect(p!.capacidad).toBe("inscripciones.seguimiento");
  });
});

describe("040 — la migración 0061", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "drizzle", "0061_rol_ventas_y_empresas.sql"),
    "utf8"
  );

  /**
   * DV-001 — Los roles creados a mano que tenían `inscripciones.ver` también
   * escribían con ella: reciben `inscripciones.seguimiento`. Los de sistema
   * van por llave (`seed-roles.test.ts`); `ventas` es de sistema, así que
   * este `update` nunca lo toca.
   */
  it("suma `inscripciones.seguimiento` a los roles creados a mano que tenían `inscripciones.ver`", () => {
    expect(sql).toMatch(
      /jsonb_build_array\('inscripciones\.seguimiento'\)[\s\S]*?where "system" = false\s+and "capabilities" @> jsonb_build_array\('inscripciones\.ver'\)/
    );
  });

  it("es re-ejecutable: columnas con `if not exists` y CHECKs contra `pg_constraint`", () => {
    const columnas = [...sql.matchAll(/alter table "company" add column (if not exists )?"/g)];
    expect(columnas.length).toBe(11);
    expect(columnas.every((m) => m[1])).toBe(true);
    expect(sql).toContain("conname = 'company_payment_terms_valid'");
    expect(sql).toContain("conname = 'company_payment_term_days_valid'");
  });
});

/**
 * 040 (DV-009) — El costo por hora del profesor es plata (lo que la academia
 * le paga) y viajaba a todo `academico.ver`. Ahora viaja solo a quien lo carga
 * (`academico.editar`) o a quien ve la plata (`cobranza.ver`): dirección,
 * coordinación, soporte y administración lo siguen viendo; Ventas no.
 */
describe("040 — el costo por hora del profesor", () => {
  const fila = {
    id: "tch_1",
    name: "Ana",
    hourlyRate: 120000,
    email: "ana@academia.uy",
    title: "Arq.",
    photoMimeType: null,
  };

  it("con las capacidades de Ventas, la llave ni existe", async () => {
    const { serializeTeacher, puedeVerCostoDocente } = await import("@/server/teachers");
    const dto = serializeTeacher(fila as never, [], puedeVerCostoDocente(ventas!.capabilities));
    expect(Object.keys(dto)).not.toContain("hourlyRate");
    expect(JSON.stringify(dto)).not.toContain("1200");
  });

  it.each([["academico.editar"], ["cobranza.ver"]] as const)("con `%s` viaja", async (cap) => {
    const { serializeTeacher, puedeVerCostoDocente } = await import("@/server/teachers");
    const dto = serializeTeacher(fila as never, [], puedeVerCostoDocente(["academico.ver", cap]));
    expect(dto.hourlyRate).toBe(120000);
  });

  it("los cuatro roles que ya lo veían lo siguen viendo", async () => {
    const { puedeVerCostoDocente } = await import("@/server/teachers");
    for (const key of ["direccion", "coordinacion", "soporte", "administracion"]) {
      const r = SYSTEM_ROLES.find((x) => x.key === key)!;
      expect(puedeVerCostoDocente(r.capabilities), key).toBe(true);
    }
    expect(puedeVerCostoDocente(ventas!.capabilities)).toBe(false);
  });

  it("las rutas que listan profesores le pasan las capacidades de la sesión", () => {
    for (const ruta of ["src/app/api/teachers/route.ts", "src/app/api/teachers/[id]/route.ts"]) {
      expect(readFileSync(path.join(process.cwd(), ruta), "utf8"), ruta).toContain(
        "sessionCapabilities(session)"
      );
    }
  });
});
