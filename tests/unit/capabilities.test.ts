import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  capabilitiesFor,
  FINANCIAL_CAPABILITIES,
  hasCapability,
  ROLE_CAPABILITIES,
  sanitizeCapabilities,
  SYSTEM_ROLES,
  type Capability,
} from "@/lib/capabilities";

/**
 * 012 (T004) — La red de la fase 1.
 *
 * El objetivo de esta fase NO es cambiar quién puede qué: es dejar de
 * expresarlo con comparaciones sueltas (`role === "soporte"`) y pasarlo a
 * capacidades nombradas. Estos casos existen para probar que el mapeo
 * reproduce EXACTAMENTE el comportamiento anterior.
 *
 * Si alguno falla, alguien le cambió los permisos a un usuario real.
 */
describe("mapeo rol → capacidades (fiel al comportamiento previo)", () => {
  it("owner puede todo", () => {
    expect(capabilitiesFor("owner")).toEqual(CAPABILITIES);
  });

  /**
   * En el código anterior la ÚNICA comparación de rol era `role === "soporte"`:
   * `owner` y `member` eran indistinguibles. El data-model proyecta a `member`
   * como coordinación (sin configuración), pero aplicarlo acá le quitaría un
   * permiso a un usuario existente. Esa distinción llega en la fase 4.
   */
  it("member puede todo, igual que owner (owner y member eran indistinguibles)", () => {
    expect(capabilitiesFor("member")).toEqual(capabilitiesFor("owner"));
  });

  it("soporte NO tiene las capacidades financieras", () => {
    expect(hasCapability("soporte", "cobranza.ver")).toBe(false);
    expect(hasCapability("soporte", "cobranza.editar")).toBe(false);
    expect(hasCapability("soporte", "inscripciones.editar")).toBe(false);
  });

  /**
   * Lo que soporte SÍ hacía antes tiene que seguir haciéndolo. El checklist de
   * onboarding y la asistencia son tarea suya (FR-014 de 005).
   */
  it("soporte conserva todo lo NO financiero", () => {
    const conserva: Capability[] = [
      "academico.ver",
      "academico.editar",
      "asistencia.ver",
      "asistencia.editar",
      "evaluacion.ver",
      "evaluacion.editar",
      "certificados.emitir",
      "contactos.ver",
      "contactos.editar",
      "inscripciones.ver",
      "inbox.ver",
      "inbox.responder",
      "configuracion.editar",
      "accesos.gestionar",
    ];
    for (const cap of conserva) {
      expect(hasCapability("soporte", cap), `soporte perdió ${cap}`).toBe(true);
    }
  });

  /**
   * FR-008 — fallar cerrado. Un rol que nadie mapeó no puede nada: se nota al
   * instante. Si pudiera todo, no se notaría hasta que fuera tarde.
   */
  it("un rol desconocido no tiene ninguna capacidad", () => {
    expect(capabilitiesFor("rol_inventado")).toEqual([]);
    expect(hasCapability("rol_inventado", "academico.ver")).toBe(false);
    expect(hasCapability("", "academico.ver")).toBe(false);
  });

  it("los tres roles reales están mapeados", () => {
    for (const role of ["owner", "member", "soporte"]) {
      expect(Object.keys(ROLE_CAPABILITIES)).toContain(role);
    }
  });

  it("no hay capacidades duplicadas en la lista", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });
});

/**
 * El viejo `requireFullAccess` se reimplementó sobre `cobranza.ver` y después
 * se eliminó (T007). Este caso fija esa equivalencia: si alguien le da esa
 * capacidad a soporte, las 9 rutas financieras se le abren de golpe — que es
 * correcto, pero tiene que ser una decisión y no un descuido.
 */
describe("equivalencia con el viejo acceso completo", () => {
  it("`cobranza.ver` separa exactamente a quien tenía acceso completo", () => {
    expect(hasCapability("owner", "cobranza.ver")).toBe(true);
    expect(hasCapability("member", "cobranza.ver")).toBe(true);
    expect(hasCapability("soporte", "cobranza.ver")).toBe(false);
  });
});

/**
 * 012 (T021, DV-006) — Los roles de sistema que se siembran en la base.
 */
describe("SYSTEM_ROLES — la semilla de la fase 4", () => {
  const byKey = (k: string) => SYSTEM_ROLES.find((r) => r.key === k);

  /**
   * **El caso que justifica el bloque.** `direccion` tiene que tener TODAS las
   * capacidades, siempre. El día que alguien agregue una capacidad nueva a la
   * lista cerrada y se olvide de otorgarla, el síntoma sería que la dueña de
   * la academia no puede hacer algo en su propio sistema y nadie entiende por
   * qué. Este test convierte ese olvido en un fallo inmediato.
   */
  it("`direccion` tiene TODAS las capacidades, incluidas las que se agreguen", () => {
    const direccion = byKey("direccion");
    expect(direccion).toBeDefined();
    const faltantes = CAPABILITIES.filter((c) => !direccion!.capabilities.includes(c));
    expect(faltantes, `capacidades sin otorgar a dirección: ${faltantes.join(", ")}`)
      .toEqual([]);
  });

  /** Coordinación gestiona la academia; configurar la instancia no es su tarea. */
  it("`coordinacion` es todo menos configurar la instancia", () => {
    const coord = byKey("coordinacion");
    expect(coord?.capabilities).not.toContain("configuracion.editar");
    expect(coord?.capabilities).toContain("cobranza.ver");
    expect(CAPABILITIES.length - coord!.capabilities.length).toBe(1);
  });

  /**
   * 012 (fase 4) — `soporte` se siembra IGUAL a como funciona hoy.
   *
   * El data-model proyectaba algo más restrictivo (solo las `.ver` no
   * financieras + `asistencia.editar`), pero la resolución de DV-006 dice "sin
   * capacidades financieras, **como hoy**" y manda la resolución. Aplicar la
   * proyección le habría sacado siete capacidades a dos cuentas reales.
   *
   * Este caso es la red: si la semilla se aparta de lo que soporte hace hoy,
   * falla antes de tocar la base.
   */
  it("`soporte` sembrado = `soporte` de hoy, sin sorpresas para dos cuentas reales", () => {
    const soporte = byKey("soporte");
    expect(soporte?.capabilities).toEqual(capabilitiesFor("soporte"));
    for (const financiera of FINANCIAL_CAPABILITIES) {
      expect(soporte?.capabilities).not.toContain(financiera);
    }
    expect(soporte?.capabilities).toContain("academico.editar");
    expect(soporte?.capabilities).toContain("asistencia.editar");
  });

  /**
   * 026 (FR-001) — Se suma un CUARTO rol: `administracion`.
   *
   * Los tres primeros siguen siendo los de DV-006 y en el mismo orden. El
   * cuarto va al final y no en el medio a propósito: el orden de esta lista es
   * el que usa `seed-roles.test.ts` para emparejar cada rol con la lista que
   * siembra su migración, y reordenarla haría fallar esa comparación por un
   * motivo que no tiene nada que ver con los permisos.
   */
  it("las llaves son las de DV-006 más `administracion`, y no se repiten", () => {
    const keys = SYSTEM_ROLES.map((r) => r.key);
    expect(keys).toEqual(["direccion", "coordinacion", "soporte", "administracion"]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * Desde la fase 4 las capacidades vienen de `jsonb` en la base, que es texto
 * sin tipo. Si alguien borra una capacidad del código y queda huérfana en una
 * fila, no puede colarse de vuelta por la puerta de atrás (DV-003).
 */
describe("sanitizeCapabilities — la base no puede inventar capacidades", () => {
  it("descarta lo que no está en la lista cerrada", () => {
    expect(sanitizeCapabilities(["academico.ver", "borrar.todo", 42, null])).toEqual([
      "academico.ver",
    ]);
  });

  it("un jsonb corrupto o no-lista no otorga nada", () => {
    expect(sanitizeCapabilities(null)).toEqual([]);
    expect(sanitizeCapabilities("academico.ver")).toEqual([]);
    expect(sanitizeCapabilities({ academico: true })).toEqual([]);
  });

  it("conserva la lista completa cuando es válida", () => {
    expect(sanitizeCapabilities([...CAPABILITIES])).toEqual([...CAPABILITIES]);
  });
});
