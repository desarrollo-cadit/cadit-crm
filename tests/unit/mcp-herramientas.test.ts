import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";
import { reglasPermitidas } from "@/lib/tareas-del-dia";

/**
 * 0092 — Las herramientas del MCP remoto: cada una declara su capacidad, se
 * ofrece solo a quien la tiene, corre en la transacción de la organización y
 * la superficie no se mezcla con lo que no le corresponde.
 */

const transacciones = vi.fn();
vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => {
      transacciones();
      return fn({ execute: async () => [] });
    },
  }),
  getDb: () => ({}),
  schema: new Proxy({}, { get: () => ({}) }),
}));

const tareasDelDia = vi.fn();
vi.mock("@/server/tareas-del-dia", () => ({
  tareasDelDia: (...args: unknown[]) => tareasDelDia(...args),
}));

const listOverdue = vi.fn();
vi.mock("@/server/billing", () => ({ listOverdue: (...args: unknown[]) => listOverdue(...args) }));

const buscarContactos = vi.fn();
vi.mock("@/server/mcp/consultas", () => ({ buscarContactos: (...args: unknown[]) => buscarContactos(...args) }));

const getStudentRecord = vi.fn();
vi.mock("@/server/student-record", () => ({ getStudentRecord: (...args: unknown[]) => getStudentRecord(...args) }));

const recorridoComercialDelContacto = vi.fn();
vi.mock("@/server/recorrido-comercial", () => ({
  recorridoComercialDelContacto: (...args: unknown[]) => recorridoComercialDelContacto(...args),
}));

const vistaDeLicencias = vi.fn();
vi.mock("@/server/license-view", () => ({ vistaDeLicencias: (...args: unknown[]) => vistaDeLicencias(...args) }));

import {
  HERRAMIENTAS,
  TOPES,
  crearServidorMcp,
  ejecutarHerramienta,
  type HerramientaMcp,
} from "@/server/mcp/tools";
import type { ContextoMcp } from "@/server/mcp/tokens";

const ctxCon = (capacidades: readonly Capability[]): ContextoMcp => ({
  tokenId: "mcpt_1",
  organizationId: "org_1",
  userId: "user_1",
  capacidades,
});

beforeEach(() => {
  transacciones.mockClear();
  tareasDelDia.mockReset().mockResolvedValue([]);
  for (const f of [listOverdue, buscarContactos, getStudentRecord, recorridoComercialDelContacto, vistaDeLicencias]) {
    f.mockReset();
  }
});

const herramientaNamed = (nombre: string) => HERRAMIENTAS.find((h) => h.nombre === nombre)!;

describe("el registro de herramientas", () => {
  it("toda herramienta declara una capacidad de la lista CERRADA", () => {
    expect(HERRAMIENTAS.length).toBeGreaterThan(0);
    for (const h of HERRAMIENTAS) {
      expect(CAPABILITIES as readonly string[], h.nombre).toContain(h.capacidad);
    }
  });

  it("los nombres son únicos y en snake_case", () => {
    const nombres = HERRAMIENTAS.map((h) => h.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const n of nombres) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("este corte es de solo lectura: cada herramienta se registra con readOnlyHint", () => {
    const fuente = readFileSync("src/server/mcp/tools.ts", "utf8");
    expect(fuente).toContain("readOnlyHint: true");
  });
});

describe("ejecutarHerramienta", () => {
  const herramienta = (ejecutar: HerramientaMcp["ejecutar"]): HerramientaMcp => ({
    nombre: "prueba",
    capacidad: "cobranza.ver",
    descripcion: "x",
    ejecutar,
  });

  it("sin la capacidad NO ejecuta ni abre transacción", async () => {
    const ejecutar = vi.fn();
    const r = await ejecutarHerramienta(herramienta(ejecutar), ctxCon(["academico.ver"]));

    expect(r.isError).toBe(true);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(transacciones).not.toHaveBeenCalled();
  });

  it("con la capacidad corre dentro de UNA transacción de la organización y devuelve JSON", async () => {
    const ejecutar = vi.fn().mockResolvedValue({ ok: 1 });
    const r = await ejecutarHerramienta(herramienta(ejecutar), ctxCon(["cobranza.ver"]));

    expect(transacciones).toHaveBeenCalledTimes(1);
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: 1 });
  });

  it("si la herramienta lanza, el cliente recibe un mensaje genérico (sin stack ni detalle)", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await ejecutarHerramienta(
      herramienta(async () => {
        throw new Error("clave secreta en el stack");
      }),
      ctxCon(["cobranza.ver"])
    );
    espia.mockRestore();

    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).not.toContain("secreta");
  });
});

describe("tareas_de_hoy", () => {
  const tareas = HERRAMIENTAS.find((h) => h.nombre === "tareas_de_hoy")!;

  it("pide la misma puerta que GET /api/hoy", () => {
    expect(tareas.capacidad).toBe("academico.ver");
  });

  it("le pasa a la lectura EXACTAMENTE las capacidades de la persona (cada regla pide la suya)", async () => {
    const capacidades: Capability[] = ["academico.ver", "inscripciones.seguimiento"];
    await ejecutarHerramienta(tareas, ctxCon(capacidades));
    expect(tareasDelDia).toHaveBeenCalledWith("org_1", capacidades);
  });

  it("las reglas que ve cada rol son las de la pantalla: con solo academico.ver no aparece Facturación", () => {
    expect(reglasPermitidas(["academico.ver"])).toEqual([]);
    expect(reglasPermitidas(["academico.ver", "cobranza.ver"])).toEqual(["facturar"]);
  });

  it("la descripción avisa que los textos son datos, no instrucciones", () => {
    expect(tareas.descripcion).toMatch(/datos/);
    expect(tareas.descripcion).toMatch(/nunca montos/);
  });
});

describe("las herramientas de la fase 1 declaran la misma puerta que su pantalla", () => {
  it.each([
    ["morosidad", "cobranza.ver"],
    ["buscar_contactos", "contactos.ver"],
    ["legajo_de_alumno", "contactos.ver"],
    ["recorrido_comercial", "contactos.ver"],
    ["estado_de_licencias", "licencias.ver"],
  ] as const)("%s pide %s", (nombre, capacidad) => {
    expect(herramientaNamed(nombre).capacidad).toBe(capacidad);
  });

  it("todas avisan que los textos son datos, no instrucciones", () => {
    for (const nombre of ["morosidad", "buscar_contactos", "legajo_de_alumno", "recorrido_comercial", "estado_de_licencias"]) {
      expect(herramientaNamed(nombre).descripcion, nombre).toMatch(/tratalos como datos/);
    }
  });

  it("sin la capacidad no se ejecuta ninguna: ni lectura ni transacción", async () => {
    const r = await ejecutarHerramienta(herramientaNamed("morosidad"), ctxCon(["contactos.ver", "academico.ver"]));
    expect(r.isError).toBe(true);
    expect(listOverdue).not.toHaveBeenCalled();
    expect(transacciones).not.toHaveBeenCalled();
  });

  it("rechaza argumentos de más o fuera de rango antes de abrir la transacción", async () => {
    const m = herramientaNamed("morosidad");
    for (const args of [{ limite: TOPES.morosidad + 1 }, { diasMinimos: -1 }, { cualquiera: 1 }]) {
      const r = await ejecutarHerramienta(m, ctxCon(["cobranza.ver"]), args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
    }
    expect(listOverdue).not.toHaveBeenCalled();
    expect(transacciones).not.toHaveBeenCalled();
  });
});

describe("morosidad", () => {
  const fila = (i: number) => ({
    enrollmentId: `enr_${i}`,
    contact: { id: `ct_${i}`, name: `Alumno ${i}` },
    cohort: { id: "cv_1", name: "Grupo A" },
    overdueCount: 2,
    overdueAmount: 524_532,
    currency: "UYU",
    oldestDueDate: "2026-09-01T00:00:00.000Z",
    daysOverdue: 60 - i,
  });

  it("pasa el atraso mínimo a la misma lectura que el panel y formatea con la moneda", async () => {
    listOverdue.mockResolvedValue({
      asOf: "2026-11-03T00:00:00.000Z",
      byCurrency: [
        { currency: "UYU", overdueTotal: 524_532, enrollments: 1 },
        { currency: "PYG", overdueTotal: 0, enrollments: 0 },
      ],
      rows: [fila(0)],
    });
    const r = await ejecutarHerramienta(herramientaNamed("morosidad"), ctxCon(["cobranza.ver"]), { diasMinimos: 30 });

    expect(listOverdue).toHaveBeenCalledWith("org_1", { minDaysOverdue: 30 });
    const dato = JSON.parse(r.content[0]!.text);
    expect(dato.totales).toEqual([
      { moneda: "UYU", adeudado: { centesimos: 524_532, moneda: "UYU", formateado: "$5.245,32" }, inscripciones: 1 },
    ]);
    expect(dato.filas[0].adeudado).toEqual({ centesimos: 524_532, moneda: "UYU", formateado: "$5.245,32" });
    expect(dato.truncado).toBe(false);
  });

  it("acota las filas, y los totales siguen cubriendo a todos", async () => {
    const muchas = Array.from({ length: TOPES.morosidad + 30 }, (_, i) => fila(i));
    listOverdue.mockResolvedValue({
      asOf: "x",
      byCurrency: [{ currency: "UYU", overdueTotal: 999, enrollments: muchas.length }],
      rows: muchas,
    });
    const r = await ejecutarHerramienta(herramientaNamed("morosidad"), ctxCon(["cobranza.ver"]));
    const dato = JSON.parse(r.content[0]!.text);

    expect(dato.filas).toHaveLength(TOPES.morosidad);
    expect(dato.truncado).toBe(true);
    expect(dato.totalDeFilas).toBe(muchas.length);
    expect(dato.totales[0].inscripciones).toBe(muchas.length);
  });
});

describe("buscar_contactos", () => {
  it("busca con el texto y el tope, y devuelve solo lo mínimo", async () => {
    buscarContactos.mockResolvedValue([{ id: "ct_1", nombre: "Ana Pérez", tipo: "lead", empresa: null }]);
    const r = await ejecutarHerramienta(herramientaNamed("buscar_contactos"), ctxCon(["contactos.ver"]), {
      texto: "perez ana",
      tipo: "lead",
    });

    expect(buscarContactos).toHaveBeenCalledWith("org_1", { q: "perez ana", tipo: "lead", limite: TOPES.contactos });
    expect(JSON.parse(r.content[0]!.text)).toEqual({
      contactos: [{ id: "ct_1", nombre: "Ana Pérez", tipo: "lead", empresa: null }],
    });
  });

  it("no acepta un tope mayor ni un tipo inventado", async () => {
    const h = herramientaNamed("buscar_contactos");
    for (const args of [{ texto: "ana", limite: TOPES.contactos + 1 }, { texto: "ana", tipo: "vip" }, { texto: "a" }]) {
      const r = await ejecutarHerramienta(h, ctxCon(["contactos.ver"]), args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
    }
    expect(buscarContactos).not.toHaveBeenCalled();
  });

  it("la lectura propia no trae teléfono ni correo", () => {
    const fuente = readFileSync("src/server/mcp/consultas.ts", "utf8");
    const seleccion = fuente.slice(fuente.indexOf(".select({"), fuente.indexOf(".from(schema.contact)"));
    expect(seleccion).not.toMatch(/phone|email|nationalId|notes/i);
  });
});

describe("legajo_de_alumno", () => {
  const legajo = (n: number) => ({
    contact: { id: "ct_1", name: "Ana", email: null, phone: null, nationalId: null },
    courses: Array.from({ length: n }, (_, i) => ({ cohortId: `cv_${i}` })),
  });

  it("le pasa las capacidades EXACTAS del token: el estado de cuenta no se arma sin cobranza.ver", async () => {
    getStudentRecord.mockResolvedValue(legajo(1));
    const capacidades: Capability[] = ["contactos.ver"];
    await ejecutarHerramienta(herramientaNamed("legajo_de_alumno"), ctxCon(capacidades), { contactoId: "ct_1" });
    expect(getStudentRecord).toHaveBeenCalledWith("org_1", "ct_1", capacidades);
  });

  it("no inventa montos: lo que la lectura no armó no aparece", async () => {
    getStudentRecord.mockResolvedValue(legajo(1));
    const r = await ejecutarHerramienta(herramientaNamed("legajo_de_alumno"), ctxCon(["contactos.ver"]), {
      contactoId: "ct_1",
    });
    expect(JSON.parse(r.content[0]!.text)).not.toHaveProperty("account");
  });

  it("un contacto ajeno o inexistente dice que no lo encontró", async () => {
    getStudentRecord.mockResolvedValue(null);
    const r = await ejecutarHerramienta(herramientaNamed("legajo_de_alumno"), ctxCon(["contactos.ver"]), {
      contactoId: "ct_x",
    });
    expect(JSON.parse(r.content[0]!.text)).toEqual({ encontrado: false });
  });

  it("acota los cursos y dice cuántos omitió", async () => {
    getStudentRecord.mockResolvedValue(legajo(TOPES.cursosDelLegajo + 5));
    const r = await ejecutarHerramienta(herramientaNamed("legajo_de_alumno"), ctxCon(["contactos.ver"]), {
      contactoId: "ct_1",
    });
    const dato = JSON.parse(r.content[0]!.text);
    expect(dato.courses).toHaveLength(TOPES.cursosDelLegajo);
    expect(dato.cursosOmitidos).toBe(5);
  });
});

describe("recorrido_comercial", () => {
  it("lee con la misma función que la ficha y no lleva montos", async () => {
    recorridoComercialDelContacto.mockResolvedValue({ historial: [], sugerencias: [] });
    const r = await ejecutarHerramienta(herramientaNamed("recorrido_comercial"), ctxCon(["contactos.ver"]), {
      contactoId: "ct_1",
    });
    expect(recorridoComercialDelContacto).toHaveBeenCalledWith("org_1", "ct_1");
    expect(JSON.parse(r.content[0]!.text)).toEqual({ encontrado: true, historial: [], sugerencias: [] });
  });

  it("sin contacto responde que no lo encontró", async () => {
    recorridoComercialDelContacto.mockResolvedValue(null);
    const r = await ejecutarHerramienta(herramientaNamed("recorrido_comercial"), ctxCon(["contactos.ver"]), {
      contactoId: "ct_x",
    });
    expect(JSON.parse(r.content[0]!.text)).toEqual({ encontrado: false });
  });
});

describe("estado_de_licencias", () => {
  const programa = (filas: number) => ({
    softwareId: "sw_1",
    name: "Revit",
    total: 10,
    hasPhoto: false,
    asignadas: 4,
    externos: 1,
    libres: 5,
    porEquipo: [],
    filas: Array.from({ length: filas }, (_, i) => ({ licenseId: `lic_${i}` })),
    faltantes: Array.from({ length: 15 }, (_, i) => ({ enrollmentId: `enr_${i}` })),
  });

  it("el correo de la licencia se consulta SOLO con contactos.ver", async () => {
    vistaDeLicencias.mockResolvedValue({ programas: [], cohortes: [], equipos: [] });
    const h = herramientaNamed("estado_de_licencias");

    await ejecutarHerramienta(h, ctxCon(["licencias.ver"]));
    expect(vistaDeLicencias).toHaveBeenLastCalledWith("org_1", { conCorreo: false });

    await ejecutarHerramienta(h, ctxCon(["licencias.ver", "contactos.ver"]));
    expect(vistaDeLicencias).toHaveBeenLastCalledWith("org_1", { conCorreo: true });
  });

  it("por defecto resume el stock, sin listar personas", async () => {
    vistaDeLicencias.mockResolvedValue({ programas: [programa(40)], cohortes: [], equipos: [] });
    const r = await ejecutarHerramienta(herramientaNamed("estado_de_licencias"), ctxCon(["licencias.ver"]));
    const [p] = JSON.parse(r.content[0]!.text).programas;

    expect(p).toMatchObject({ nombre: "Revit", total: 10, asignadas: 4, externos: 1, libres: 5, faltantesDelGrupo: 15 });
    expect(p.faltantes).toHaveLength(TOPES.faltantes);
    expect(p).not.toHaveProperty("licencias");
  });

  it("con detalle acota las licencias por programa y dice cuántas omitió", async () => {
    vistaDeLicencias.mockResolvedValue({ programas: [programa(40)], cohortes: [], equipos: [] });
    const r = await ejecutarHerramienta(herramientaNamed("estado_de_licencias"), ctxCon(["licencias.ver"]), {
      detalle: true,
    });
    const [p] = JSON.parse(r.content[0]!.text).programas;

    expect(p.licencias).toHaveLength(TOPES.licenciasPorPrograma);
    expect(p.licenciasOmitidas).toBe(40 - TOPES.licenciasPorPrograma);
  });
});

describe("el servidor MCP por pedido (cliente real, transporte en memoria)", () => {
  async function conectar(ctx: ContextoMcp) {
    const [clienteT, servidorT] = InMemoryTransport.createLinkedPair();
    await crearServidorMcp(ctx).connect(servidorT);
    const cliente = new Client({ name: "prueba", version: "1.0.0" });
    await cliente.connect(clienteT);
    return cliente;
  }

  it("ofrece a quien tiene academico.ver solo lo que esa capacidad abre (sin licencias), todo de solo lectura", async () => {
    const cliente = await conectar(ctxCon(["academico.ver"]));
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["tareas_de_hoy"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
  });

  it("cada rol ve SOLO las herramientas de sus capacidades", async () => {
    const porCapacidad: [Capability, string[]][] = [
      ["cobranza.ver", ["morosidad"]],
      ["licencias.ver", ["estado_de_licencias"]],
      ["contactos.ver", ["buscar_contactos", "legajo_de_alumno", "recorrido_comercial"]],
    ];
    for (const [capacidad, esperadas] of porCapacidad) {
      const { tools } = await (await conectar(ctxCon([capacidad]))).listTools();
      expect(tools.map((t) => t.name).sort(), capacidad).toEqual(esperadas);
    }
  });

  it("publica el esquema de argumentos de las que los reciben", async () => {
    const cliente = await conectar(ctxCon(["contactos.ver"]));
    const { tools } = await cliente.listTools();
    const buscar = tools.find((t) => t.name === "buscar_contactos")!;
    expect(buscar.inputSchema.required).toContain("texto");
  });

  it("un argumento inválido llega como error de herramienta y no ejecuta nada", async () => {
    const cliente = await conectar(ctxCon(["contactos.ver"]));
    const r = await cliente.callTool({ name: "buscar_contactos", arguments: { texto: "a" } });
    expect(r.isError).toBe(true);
    expect(buscarContactos).not.toHaveBeenCalled();
  });

  it("a quien no la tiene no le ofrece ninguna herramienta", async () => {
    // Una capacidad que ninguna herramienta pide (cobranza.ver ya abre `morosidad`).
    const cliente = await conectar(ctxCon(["asistencia.editar"]));
    expect(cliente.getServerCapabilities()?.tools).toBeUndefined();
  });

  it("llamarla devuelve los grupos como texto JSON, leídos con las capacidades del token", async () => {
    tareasDelDia.mockResolvedValue([{ ruleId: "leads", titulo: "Interesados sin contactar", items: [] }]);
    const capacidades: Capability[] = ["academico.ver", "inscripciones.seguimiento"];
    const cliente = await conectar(ctxCon(capacidades));

    const r = await cliente.callTool({ name: "tareas_de_hoy", arguments: {} });

    const contenido = r.content as { type: string; text: string }[];
    expect(contenido[0]!.type).toBe("text");
    expect(JSON.parse(contenido[0]!.text)).toEqual({
      grupos: [{ ruleId: "leads", titulo: "Interesados sin contactar", items: [] }],
    });
    expect(tareasDelDia).toHaveBeenCalledWith("org_1", capacidades);
    expect(transacciones).toHaveBeenCalledTimes(1);
  });
});

/* ===================================================== guardas estructurales */

const raiz = process.cwd();
const archivosDe = (dir: string): string[] =>
  readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? archivosDe(path.join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(dir, e.name).replace(/\\/g, "/")]
        : []
  );
const leer = (f: string) => readFileSync(path.join(raiz, f), "utf8");

const SUPERFICIE_MCP = [
  ...archivosDe("src/server/mcp"),
  "src/lib/mcp-token.ts",
  "src/app/api/mcp/route.ts",
  ...archivosDe("src/app/api/settings/mcp-tokens"),
];

describe("la superficie MCP no se mezcla con lo que no le corresponde", () => {
  it("no importa correo, marketing, WhatsApp, Zoom ni el agente", () => {
    const prohibidos =
      /from\s+"(@\/server\/(marketing|email|whatsapp|inbox|ai|zoom|bot\/(?!auth))|@\/lib\/(m365|meta|zoom))/;
    const conImportProhibido = SUPERFICIE_MCP.filter((f) => prohibidos.test(leer(f)));
    expect(conImportProhibido, "la superficie MCP importa módulos de otros canales").toEqual([]);
  });

  it("la ruta `/api/mcp` no toca la base: pasa por el módulo de tokens y las herramientas", () => {
    const ruta = leer("src/app/api/mcp/route.ts");
    expect(ruta).not.toMatch(/\bgetDb\b|\bschema\b/);
  });

  it("listar tokens nunca selecciona el hash", () => {
    const fuente = leer("src/server/mcp/tokens.ts");
    const cuerpo = fuente.slice(
      fuente.indexOf("export async function listarTokens"),
      fuente.indexOf("export async function revocarToken")
    );
    expect(cuerpo).not.toContain("tokenHash");
  });

  it("emitir un token no guarda el valor en claro", () => {
    const fuente = leer("src/server/mcp/tokens.ts");
    const cuerpo = fuente.slice(
      fuente.indexOf("export async function emitirToken"),
      fuente.indexOf("export type TokenListado")
    );
    expect(cuerpo).toContain("tokenHash: nuevo.hash");
    expect(cuerpo).not.toMatch(/values\(\{[^}]*\btoken:/s);
  });

  it("administrar tokens pide accesos.gestionar en cada handler, sin puertas del portal", () => {
    for (const f of archivosDe("src/app/api/settings/mcp-tokens").filter((x) => x.endsWith("route.ts"))) {
      const src = leer(f);
      const handlers = src.match(/export const (GET|POST|PATCH|PUT|DELETE) =/g) ?? [];
      const conCapacidad = src.match(/requireCapability\(\s*"accesos\.gestionar"/g) ?? [];
      expect(handlers.length, f).toBeGreaterThan(0);
      expect(conCapacidad.length, f).toBe(handlers.length);
      expect(src, f).not.toMatch(/requireTeacherPortal|requireStudentPortal|resolvePortalSession/);
    }
  });

  it("la respuesta de emitir no se guarda en caché", () => {
    expect(leer("src/app/api/settings/mcp-tokens/route.ts")).toContain('"Cache-Control": "no-store"');
  });
});
