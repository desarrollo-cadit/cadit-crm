import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  SYSTEM_ROLES,
  capabilitiesFor,
  type Capability,
} from "@/lib/capabilities";
import { CURRENCIES } from "@/lib/db/schema";
import { DESTINOS_MENU, NAV_GROUPS } from "@/lib/nav";
import { GUIA_CAPACIDADES, rutaDeDonde } from "@/lib/guia";
import {
  armarAnulados,
  armarCaja,
  armarDevengado,
  cierreVacio,
  resolverPeriodo,
  type CuotaDelPeriodo,
  type PagoDelPeriodo,
} from "@/server/finanzas-periodo";

/**
 * 026 — Administración y finanzas.
 *
 * Lo que esta pantalla produce no se mira: **se transcribe a mano** a un
 * sistema contable que no controlamos. Eso cambia qué es un error grave. Un
 * total mal calculado en el dashboard se nota y se corrige; un total mal
 * calculado acá se copia a Bit, se cierra el mes, y aparece en el ejercicio.
 *
 * Por eso los casos de este archivo se ejercen sobre las FILAS y no sólo
 * sobre los agregados (FR-022): el bug de monedas mezcladas del ciclo 007
 * —corregido en `17e4844`— vivía en un total, pero la fila es lo que el
 * contador copia.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const MIGRACION = "drizzle/0036_seed_rol_administracion.sql";
const MODULO = "src/server/finanzas-periodo.ts";

/* ============================================================
 * El rol (FR-001 … FR-005)
 * ============================================================ */

describe("FR-001 — el rol `administracion` existe y lleva exactamente 4 capacidades", () => {
  const rol = SYSTEM_ROLES.find((r) => r.key === "administracion");

  const ESPERADAS: Capability[] = [
    "cobranza.ver",
    "inscripciones.ver",
    "academico.ver",
    "contactos.ver",
  ];

  it("está sembrado entre los roles de sistema", () => {
    expect(rol, "`administracion` no está en SYSTEM_ROLES").toBeDefined();
    expect(rol!.name).toBe("Administración");
  });

  it("lleva las cuatro, y ni una más", () => {
    expect([...rol!.capabilities].sort()).toEqual([...ESPERADAS].sort());
    expect(rol!.capabilities).toHaveLength(4);
  });

  /**
   * **Las exclusiones son el requisito, no las inclusiones.** Cualquiera de
   * estas cuatro convierte a un rol que transcribe en un rol que opera:
   * `cobranza.editar` puede anular un pago para que un total cuadre;
   * `inscripciones.editar` reescribe el devengado del período que se está
   * copiando; `accesos.gestionar` le deja concederse a sí mismo cualquier
   * otra; `inbox.ver` abre las conversaciones de 340 personas.
   */
  it.each([
    "cobranza.editar",
    "inscripciones.editar",
    "accesos.gestionar",
    "configuracion.editar",
    "inbox.ver",
    "inbox.responder",
    "contactos.editar",
    "academico.editar",
    "asistencia.editar",
    "evaluacion.editar",
    "certificados.emitir",
  ] as Capability[])("no lleva `%s`", (cap) => {
    expect(rol!.capabilities).not.toContain(cap);
  });

  it("las llaves de los roles de sistema no se repiten", () => {
    const keys = SYSTEM_ROLES.map((r) => r.key);
    expect(keys).toEqual(["direccion", "coordinacion", "soporte", "administracion"]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("FR-004 — `ROLE_CAPABILITIES` NO se extiende", () => {
  /**
   * Ese mapa no tiene ni `direccion` ni `coordinacion`: los dos funcionan por
   * su fila sembrada en la base. Agregar `administracion` ahí crearía una
   * cuarta fuente de verdad, capaz de divergir de la base sin que nadie lo
   * note.
   */
  it("el respaldo en código sigue teniendo sólo owner, member y soporte", () => {
    expect(Object.keys(ROLE_CAPABILITIES).sort()).toEqual([
      "member",
      "owner",
      "soporte",
    ]);
  });

  it("`capabilitiesFor` sigue fallando cerrado para el rol nuevo", () => {
    expect(capabilitiesFor("administracion")).toEqual([]);
  });
});

describe("FR-002/FR-003 — la migración siembra el rol donde falta y no pisa nada", () => {
  const SQL = leer(MIGRACION);

  it("siembra `administracion` con las capacidades de `SYSTEM_ROLES`", () => {
    const listas = [...SQL.matchAll(/'(\[[^\]]*\])'::jsonb/g)].map(
      (m) => JSON.parse(m[1]!) as string[]
    );
    expect(listas, "la migración no declara ninguna lista de capacidades").toHaveLength(1);
    const rol = SYSTEM_ROLES.find((r) => r.key === "administracion")!;
    expect([...listas[0]!].sort()).toEqual([...rol.capabilities].sort());
  });

  it("no inventa capacidades: todas existen en la lista cerrada", () => {
    const validas = new Set<string>(CAPABILITIES);
    const raras = [...SQL.matchAll(/"([a-z]+\.[a-z]+)"/g)]
      .map((m) => m[1]!)
      .filter((c) => !validas.has(c));
    expect(raras, `capacidades que no existen: ${raras.join(", ")}`).toEqual([]);
  });

  /**
   * FR-003 (constitución IV) — Re-ejecutable, y **sin pisar lo editado**.
   * `do nothing` y no `do update`: si el dueño ya le sacó una capacidad al rol
   * desde `/settings/roles`, una segunda corrida no se la devuelve.
   */
  it("es idempotente y no reescribe capacidades ya editadas", () => {
    expect(SQL).toMatch(
      /on conflict\s*\(\s*"organization_id"\s*,\s*"key"\s*\)\s*do nothing/i
    );
    expect(SQL, "un `do update` deshace la configuración del dueño").not.toMatch(
      /do update/i
    );
  });

  it("el id es determinístico: una segunda corrida ni genera otra fila candidata", () => {
    expect(SQL).toContain("md5(");
    expect(SQL).not.toMatch(/random\(\)/);
  });

  /**
   * El alcance de la fase: **ninguna tabla nueva**. La marca de "transcrito"
   * (DV-001) se resolvió con la alternativa barata —acotar por rango de
   * fechas—, así que no hay tabla de dominio y por lo tanto no hay política
   * `tenant_isolation` que escribir.
   */
  it("no crea ninguna tabla: la fase no agrega dominio", () => {
    expect(SQL.toLowerCase()).not.toContain("create table");
    expect(SQL.toLowerCase()).not.toContain("row level security");
  });
});

/* ============================================================
 * El período (FR-018, DV-002)
 * ============================================================ */

describe("FR-018 — los límites del período se resuelven en la zona de la organización", () => {
  /**
   * "Agosto" en UTC empieza el 31 de julio a las 21:00 en Montevideo. La
   * diferencia son los pagos de la última noche del mes, que es cuando más se
   * paga: con los límites en UTC, esos pagos se pierden de un mes y aparecen
   * en el otro.
   */
  it("agosto en Montevideo va de 2026-08-01T03:00Z a 2026-09-01T03:00Z", () => {
    const p = resolverPeriodo("2026-08", "America/Montevideo");
    expect(p.desde.toISOString()).toBe("2026-08-01T03:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(p.mes).toBe("2026-08");
  });

  it("la misma etiqueta de mes en otra zona da OTROS instantes", () => {
    const p = resolverPeriodo("2026-08", "Europe/Madrid");
    expect(p.desde.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("diciembre cruza el año sin romperse", () => {
    const p = resolverPeriodo("2026-12", "America/Montevideo");
    expect(p.desde.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  /** El fin es EXCLUSIVO: un pago del 1° de septiembre no es caja de agosto. */
  it("el fin del período es exclusivo", () => {
    const p = resolverPeriodo("2026-08", "America/Montevideo");
    expect(p.hasta.getTime()).toBeGreaterThan(p.desde.getTime());
    expect(p.hasta.toISOString()).toBe(
      resolverPeriodo("2026-09", "America/Montevideo").desde.toISOString()
    );
  });

  /**
   * DV-002 — El período por defecto es el mes ANTERIOR, que es el que se
   * cierra. Abrir en el mes en curso invita a transcribir un período que
   * todavía se está moviendo.
   */
  it("sin mes elegido abre en el mes anterior, no en el corriente", () => {
    const p = resolverPeriodo(null, "America/Montevideo", new Date("2026-09-07T15:00:00Z"));
    expect(p.mes).toBe("2026-08");
  });

  it("y en enero el anterior es diciembre del año pasado", () => {
    const p = resolverPeriodo(null, "America/Montevideo", new Date("2027-01-04T15:00:00Z"));
    expect(p.mes).toBe("2026-12");
  });

  /**
   * El mes "de hoy" también se lee en la zona de la organización. A las
   * 01:00 UTC del 1° de septiembre en Montevideo todavía es 31 de agosto: el
   * mes que se cierra es julio, no agosto.
   */
  it("el mes en curso se lee en la zona, no en UTC", () => {
    const p = resolverPeriodo(null, "America/Montevideo", new Date("2026-09-01T01:00:00Z"));
    expect(p.mes).toBe("2026-07");
  });

  it("la etiqueta se muestra en castellano", () => {
    expect(resolverPeriodo("2026-08", "America/Montevideo").etiqueta).toBe("Agosto 2026");
  });

  it("un mes mal escrito cae al mes anterior en vez de inventar fechas", () => {
    const p = resolverPeriodo("no-es-un-mes", "America/Montevideo", new Date("2026-09-07T15:00:00Z"));
    expect(p.mes).toBe("2026-08");
  });
});

/* ============================================================
 * Caja (FR-010 … FR-012)
 * ============================================================ */

const pago = (p: Partial<PagoDelPeriodo> & { id: string }): PagoDelPeriodo => ({
  paidAt: new Date("2026-08-10T14:00:00Z"),
  voidedAt: null,
  voidReason: null,
  amount: 1000,
  currency: "UYU",
  method: "efectivo",
  receiptNumber: null,
  alumno: "Ana Pérez",
  cohorte: "Camada Marzo",
  curso: "Revit",
  ...p,
});

describe("FR-010 — Caja lista lo que ENTRÓ, y nada más", () => {
  it("un pago anulado no aparece ni suma", () => {
    const bloques = armarCaja([
      pago({ id: "pay_ok", amount: 1000 }),
      pago({
        id: "pay_anulado",
        amount: 9_999_999,
        voidedAt: new Date("2026-08-20T10:00:00Z"),
        voidReason: "cargado dos veces",
      }),
    ]);

    expect(bloques).toHaveLength(1);
    expect(bloques[0]!.filas.map((f) => f.id)).toEqual(["pay_ok"]);
    expect(bloques[0]!.total).toBe(1000);
  });

  /**
   * `paid_at` y no `created_at`: la caja de agosto es la plata que entró en
   * agosto, aunque se haya cargado en septiembre. El filtro por rango lo hace
   * la consulta; este caso guarda que el módulo no mire la otra columna.
   */
  it("el módulo mira `paidAt`, nunca `createdAt`", () => {
    const src = leer(MODULO);
    expect(src).toContain("payment.paidAt");
    expect(
      src.includes("payment.createdAt"),
      "la caja del mes se armó con la fecha de CARGA, no con la del cobro"
    ).toBe(false);
    expect(src).toContain("isNull(schema.payment.voidedAt)");
  });

  it("cada fila trae lo que el contador tiene que copiar (FR-011)", () => {
    const [bloque] = armarCaja([
      pago({ id: "pay_1", method: "transferencia", receiptNumber: "A-42" }),
    ]);
    const fila = bloque!.filas[0]!;
    expect(fila).toMatchObject({
      id: "pay_1",
      alumno: "Ana Pérez",
      cohorte: "Camada Marzo",
      curso: "Revit",
      metodo: "transferencia",
      importe: 1000,
      currency: "UYU",
      recibo: "A-42",
    });
    expect(fila.fecha).toBe("2026-08-10T14:00:00.000Z");
  });
});

describe("FR-012 — el orden es estable y determinista", () => {
  /**
   * **El requisito silencioso de toda pantalla de transcripción.** Sin
   * desempate explícito, dos pagos del mismo instante pueden salir en distinto
   * orden entre dos cargas, y el contador que volvió a la pantalla saltea una
   * fila o transcribe otra dos veces. Los dos errores cuestan lo mismo y los
   * dos aparecen semanas después.
   */
  it("dos pagos del MISMO instante salen siempre en el mismo orden", () => {
    const mismoInstante = new Date("2026-08-10T14:00:00Z");
    const entrada = [
      pago({ id: "pay_zzz", paidAt: mismoInstante }),
      pago({ id: "pay_aaa", paidAt: mismoInstante }),
      pago({ id: "pay_mmm", paidAt: mismoInstante }),
    ];

    expect(armarCaja(entrada)[0]!.filas.map((f) => f.id)).toEqual([
      "pay_aaa",
      "pay_mmm",
      "pay_zzz",
    ]);

    // Y con la entrada en otro orden —que es lo que puede devolver Postgres
    // sin un ORDER BY total— el resultado no cambia.
    expect(armarCaja([...entrada].reverse())[0]!.filas.map((f) => f.id)).toEqual([
      "pay_aaa",
      "pay_mmm",
      "pay_zzz",
    ]);
  });

  it("la misma consulta dos veces devuelve el mismo orden (SC-004)", () => {
    const entrada = [
      pago({ id: "pay_b", paidAt: new Date("2026-08-02T10:00:00Z") }),
      pago({ id: "pay_a", paidAt: new Date("2026-08-01T10:00:00Z") }),
    ];
    const primera = armarCaja(entrada)[0]!.filas.map((f) => f.id);
    const segunda = armarCaja(entrada)[0]!.filas.map((f) => f.id);
    expect(primera).toEqual(segunda);
    expect(primera).toEqual(["pay_a", "pay_b"]);
  });
});

/* ============================================================
 * Devengado (FR-013 … FR-015, DV-003)
 * ============================================================ */

const cuota = (c: Partial<CuotaDelPeriodo> & { id: string }): CuotaDelPeriodo => ({
  numero: 1,
  dueDate: new Date("2026-08-10T00:00:00Z"),
  canceledAt: null,
  amount: 1000,
  pagado: 0,
  currency: "UYU",
  alumno: "Ana Pérez",
  cohorte: "Camada Marzo",
  curso: "Revit",
  ...c,
});

const AHORA = new Date("2026-09-07T12:00:00Z");

describe("FR-013/FR-014/FR-015 — Devengado usa `due_date` y el vocabulario que ya existe", () => {
  it("una cuota anulada no figura: no se devengó", () => {
    const bloques = armarDevengado(
      [
        cuota({ id: "ins_ok" }),
        cuota({ id: "ins_anulada", amount: 500_000, canceledAt: new Date("2026-08-15") }),
      ],
      AHORA
    );
    expect(bloques[0]!.filas.map((f) => f.id)).toEqual(["ins_ok"]);
    expect(bloques[0]!.totalEmitido).toBe(1000);
  });

  it("el módulo mira `due_date`, no `paid_at`", () => {
    const src = leer(MODULO);
    expect(src).toContain("installment.dueDate");
    expect(src).toContain("isNull(schema.installment.canceledAt)");
  });

  /**
   * FR-014 — El estado sale de `installmentStatus`. **No se inventa un
   * vocabulario paralelo**: un modelo de tres valores pierde `parcial`, que es
   * justamente el caso donde caja y devengado divergen.
   */
  it("los estados son los de `installmentStatus`, incluido `parcial`", () => {
    const [bloque] = armarDevengado(
      [
        cuota({ id: "ins_pagada", amount: 1000, pagado: 1000 }),
        cuota({
          id: "ins_parcial",
          amount: 1000,
          pagado: 400,
          dueDate: new Date("2026-12-10T00:00:00Z"),
        }),
        cuota({ id: "ins_vencida", amount: 1000, pagado: 0 }),
        cuota({
          id: "ins_pendiente",
          amount: 1000,
          pagado: 0,
          dueDate: new Date("2026-12-10T00:00:00Z"),
        }),
      ],
      AHORA
    );

    const porId = new Map(bloque!.filas.map((f) => [f.id, f]));
    expect(porId.get("ins_pagada")!.estado).toBe("pagada");
    expect(porId.get("ins_parcial")!.estado).toBe("parcial");
    expect(porId.get("ins_vencida")!.estado).toBe("vencida");
    expect(porId.get("ins_pendiente")!.estado).toBe("pendiente");

    const VOCABULARIO = ["pagada", "parcial", "vencida", "pendiente"];
    for (const f of bloque!.filas) expect(VOCABULARIO).toContain(f.estado);
  });

  it("el módulo reusa `installmentStatus` en vez de escribir el suyo", () => {
    const src = leer(MODULO);
    expect(src).toContain("installmentStatus");
    expect(src).toContain('from "@/server/billing"');
  });

  it("cada fila trae importe, pagado y saldo con su moneda (FR-015)", () => {
    const [bloque] = armarDevengado(
      [cuota({ id: "ins_1", amount: 1000, pagado: 400, currency: "PYG" })],
      AHORA
    );
    expect(bloque!.filas[0]).toMatchObject({
      importe: 1000,
      pagado: 400,
      saldo: 600,
      currency: "PYG",
    });
  });

  /** DV-003 — La transcripción es cronológica: por vencimiento, y a igual
   * vencimiento por alumno. */
  it("ordena por vencimiento, con desempate por alumno", () => {
    const [bloque] = armarDevengado(
      [
        cuota({ id: "c", dueDate: new Date("2026-08-20"), alumno: "Ana" }),
        cuota({ id: "b", dueDate: new Date("2026-08-10"), alumno: "Zulema" }),
        cuota({ id: "a", dueDate: new Date("2026-08-10"), alumno: "Bruno" }),
      ],
      AHORA
    );
    expect(bloque!.filas.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("y a igual vencimiento y alumno desempata por id: nunca queda al azar", () => {
    const mismo = new Date("2026-08-10");
    const [bloque] = armarDevengado(
      [
        cuota({ id: "ins_z", dueDate: mismo, alumno: "Ana", numero: 2 }),
        cuota({ id: "ins_a", dueDate: mismo, alumno: "Ana", numero: 1 }),
      ],
      AHORA
    );
    expect(bloque!.filas.map((f) => f.id)).toEqual(["ins_a", "ins_z"]);
  });
});

/* ============================================================
 * Monedas (FR-016, FR-017, FR-022)
 * ============================================================ */

describe("FR-016/FR-022 — ningún total mezcla monedas, y no existe un total general", () => {
  const TRES_MONEDAS = [
    pago({ id: "p_uyu", amount: 150_000, currency: "UYU" }),
    pago({ id: "p_pyg", amount: 4_000_000, currency: "PYG" }),
    pago({ id: "p_usd", amount: 1_200, currency: "USD" }),
  ];

  it("tres monedas → tres bloques, tres totales, ninguno cruzado", () => {
    const bloques = armarCaja(TRES_MONEDAS);
    expect(bloques.map((b) => b.currency)).toEqual(["UYU", "PYG", "USD"]);
    expect(bloques.map((b) => b.total)).toEqual([150_000, 4_000_000, 1_200]);

    const cruzado = 150_000 + 4_000_000 + 1_200;
    expect(bloques.some((b) => b.total === cruzado)).toBe(false);
  });

  /**
   * FR-022 se ejerce sobre las FILAS y no sólo sobre los agregados: el total
   * de un bloque tiene que ser exactamente la suma de las filas de ESE bloque.
   */
  it("el total de cada bloque es la suma de SUS filas, y de ninguna otra", () => {
    for (const b of armarCaja(TRES_MONEDAS)) {
      expect(b.filas.every((f) => f.currency === b.currency)).toBe(true);
      expect(b.total).toBe(b.filas.reduce((s, f) => s + f.importe, 0));
    }
  });

  it("lo mismo en devengado: cada fila de un bloque es de su moneda", () => {
    const bloques = armarDevengado(
      [
        cuota({ id: "i_uyu", amount: 19_000, pagado: 19_000, currency: "UYU" }),
        cuota({ id: "i_usd", amount: 300, pagado: 100, currency: "USD" }),
      ],
      AHORA
    );
    for (const b of bloques) {
      expect(b.filas.every((f) => f.currency === b.currency)).toBe(true);
      expect(b.totalEmitido).toBe(b.filas.reduce((s, f) => s + f.importe, 0));
      expect(b.totalPagado).toBe(b.filas.reduce((s, f) => s + f.pagado, 0));
      expect(b.totalSaldo).toBe(b.filas.reduce((s, f) => s + f.saldo, 0));
    }
  });

  /**
   * El orden de las monedas es el de `CURRENCIES`, FIJO, para que la pantalla
   * no se reordene mes a mes según qué moneda vendió.
   */
  it("el orden de los bloques es el de CURRENCIES, sin importar la entrada", () => {
    const alReves = armarCaja([...TRES_MONEDAS].reverse());
    expect(alReves.map((b) => b.currency)).toEqual([...CURRENCIES]);
  });

  /**
   * Una tabla vacía con un total en cero se transcribe igual de mal que un
   * número errado: el bloque directamente no se dibuja.
   */
  it("una moneda sin movimiento no dibuja bloque (ni un cero)", () => {
    const bloques = armarCaja([pago({ id: "p_usd", currency: "USD" })]);
    expect(bloques.map((b) => b.currency)).toEqual(["USD"]);
  });

  it("no existe ningún «total general» en la forma del cierre", () => {
    const cierre = cierreVacio(resolverPeriodo("2026-08", "America/Montevideo"));
    const llaves = JSON.stringify(cierre).toLowerCase();
    for (const prohibida of ["totalgeneral", "granTotal".toLowerCase(), "totalglobal"]) {
      expect(llaves).not.toContain(prohibida);
    }
    expect(Object.keys(cierre).sort()).toEqual([
      "caja",
      "anulados",
      "devengado",
      "periodo",
    ].sort());
  });
});

describe("FR-017 — caja y devengado nunca se suman ni se restan entre sí", () => {
  /**
   * Una cuota de agosto cobrada en septiembre está en el devengado de agosto
   * **y** en la caja de septiembre: no es una inconsistencia, es la
   * definición. Cualquier "diferencia" entre las dos necesita un criterio
   * contable que el CRM no tiene y no debe inventar.
   */
  const FUENTES = [MODULO, "src/components/finanzas/finanzas-client.tsx"];

  it("ni el servidor ni la pantalla calculan una diferencia entre las dos", () => {
    for (const f of FUENTES) {
      const src = leer(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(
        /diferencia|totalGeneral|granTotal|totalGlobal/i.test(src),
        `${f} presenta caja y devengado como un solo número`
      ).toBe(false);
    }
  });

  it("son dos listas separadas en la respuesta, no una combinada", () => {
    const cierre = cierreVacio(resolverPeriodo("2026-08", "America/Montevideo"));
    expect(Array.isArray(cierre.caja)).toBe(true);
    expect(Array.isArray(cierre.devengado)).toBe(true);
    expect(cierre.caja).not.toBe(cierre.devengado);
  });
});

/* ============================================================
 * Anulados (DV-004)
 * ============================================================ */

describe("DV-004 — las anulaciones del período van en un tercer listado, aparte", () => {
  const CON_ANULADO = [
    pago({ id: "p_vivo", amount: 1000 }),
    pago({
      id: "p_muerto",
      amount: 7000,
      voidedAt: new Date("2026-08-25T09:00:00Z"),
      voidReason: "el alumno pidió el reintegro",
    }),
  ];

  it("el anulado sale de Caja y entra en su propia lista, con el motivo", () => {
    expect(armarCaja(CON_ANULADO).flatMap((b) => b.filas).map((f) => f.id)).toEqual([
      "p_vivo",
    ]);

    const anulados = armarAnulados(CON_ANULADO);
    expect(anulados.map((a) => a.id)).toEqual(["p_muerto"]);
    expect(anulados[0]!.motivo).toBe("el alumno pidió el reintegro");
    expect(anulados[0]!.importe).toBe(7000);
    expect(anulados[0]!.currency).toBe("UYU");
  });

  it("nunca se mezcla con Caja: un pago vigente no aparece entre las anulaciones", () => {
    expect(armarAnulados(CON_ANULADO).some((a) => a.id === "p_vivo")).toBe(false);
  });

  it("las anulaciones también salen en orden estable", () => {
    const mismo = new Date("2026-08-25T09:00:00Z");
    const anulados = armarAnulados([
      pago({ id: "p_z", voidedAt: mismo, voidReason: "x" }),
      pago({ id: "p_a", voidedAt: mismo, voidReason: "y" }),
    ]);
    expect(anulados.map((a) => a.id)).toEqual(["p_a", "p_z"]);
  });
});

/* ============================================================
 * Navegación y guía (FR-007, FR-008 + FR-019 de la 027)
 * ============================================================ */

describe("FR-007/FR-008 — la vista se gobierna con `cobranza.ver` y se declara en el menú", () => {
  const item = DESTINOS_MENU.find((d) => d.href === "/finanzas");

  it("el ítem existe y declara `cobranza.ver`", () => {
    expect(item, "`/finanzas` no está declarado en `NAV_GROUPS`").toBeDefined();
    expect(item!.capability).toBe("cobranza.ver");
  });

  it("no se agregó ninguna capacidad nueva a la lista cerrada", () => {
    expect(CAPABILITIES).toHaveLength(17);
    expect(CAPABILITIES).not.toContain("finanzas.ver" as Capability);
  });

  it("el ítem se declara en `src/lib/nav.ts`, no en el componente", () => {
    const nav = leer("src/lib/nav.ts");
    expect(nav).toContain('"/finanzas"');
    const comp = leer("src/components/app-nav.tsx");
    expect(comp).not.toContain('"/finanzas"');
  });
});

/**
 * **La prueba de fuego de la 027 (su FR-019).** La guía se DERIVA de
 * `CAPABILITIES` + `NAV_GROUPS`: un rol nuevo y una pantalla nueva tienen que
 * aparecer sin escribir una línea de guía. Si esto obligara a cambiar la
 * estructura de `src/lib/guia.ts`, la derivación no habría funcionado.
 */
describe("027/FR-019 — el rol y la pantalla nuevos entran en la guía sin tocarla", () => {
  it("las 4 capacidades del rol nuevo ya están descritas", () => {
    const rol = SYSTEM_ROLES.find((r) => r.key === "administracion")!;
    for (const c of rol.capabilities) {
      expect(GUIA_CAPACIDADES[c], `la guía no describe ${c}`).toBeTruthy();
      expect(GUIA_CAPACIDADES[c].que.trim().length).toBeGreaterThan(12);
    }
  });

  it("el «dónde» de `cobranza.ver` lleva al destino que el menú declara", () => {
    const destinos = DESTINOS_MENU.filter((d) => d.capability === "cobranza.ver").map(
      (d) => d.href
    );
    expect(destinos).toContain(rutaDeDonde(GUIA_CAPACIDADES["cobranza.ver"].donde));
  });

  /**
   * `DESTINOS_MENU` se DERIVA de `NAV_GROUPS`, así que este caso comprueba que
   * el ítem entró por la declaración del menú y no por una lista aparte: si
   * alguien lo agregara sólo a los destinos, acá no aparecería.
   */
  it("el ítem sale de `NAV_GROUPS`, que es lo que la guía lee", () => {
    const grupos = NAV_GROUPS.filter((g) =>
      (g.items as readonly { href: string }[]).some((i) => i.href === "/finanzas")
    );
    expect(grupos.map((g) => g.label)).toEqual(["Gestión"]);
  });
});
