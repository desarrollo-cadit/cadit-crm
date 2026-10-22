import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  armarAvisoSinConfirmar,
  avisoSinConfirmarQueToca,
  avisoSinConfirmarQueTocaHoy,
  correosConCapacidad,
  grupoRecibeAvisoSinConfirmar,
  inicioDeLaClave,
  sujetoSinConfirmar,
} from "@/lib/avisos-sin-confirmar";
import { CAPABILITIES } from "@/lib/capabilities";
import {
  claveDeAviso,
  columnasDelSujeto,
  STAFF_NOTICE_KINDS,
  STAFF_NOTICE_LABELS,
  sujetoDeRegistro,
} from "@/lib/staff-notices";

/**
 * Avisos de grupos SIN CONFIRMAR: a T-7, T-2 y el día de inicio, si el grupo
 * todavía no se confirmó, le llega un correo a cada persona que PUEDE
 * confirmarlo (capacidad `cohortes.confirmar`, nunca un nombre de rol).
 */

const TZ = "America/Montevideo";
// El inicio se guarda a medianoche UTC del día.
const inicio = new Date("2026-11-10T00:00:00.000Z");
const grupo = { startDate: inicio, confirmedAt: null as Date | null };

/** Mediodía en Montevideo (15:00 UTC) del día dado. */
const dia = (d: string) => new Date(`${d}T15:00:00.000Z`);

describe("qué ventana toca hoy", () => {
  it.each([
    ["2026-11-03", "sin_confirmar_t7"], // faltan 7
    ["2026-11-05", "sin_confirmar_t7"], // faltan 5: un servidor apagado se pone al día
    ["2026-11-07", "sin_confirmar_t7"], // faltan 3
    ["2026-11-08", "sin_confirmar_t2"], // faltan 2
    ["2026-11-09", "sin_confirmar_t2"], // faltan 1
    ["2026-11-10", "sin_confirmar_inicio"], // el día de inicio
  ])("el %s → %s", (hoy, esperado) => {
    expect(avisoSinConfirmarQueToca(grupo, dia(hoy), TZ)).toBe(esperado);
  });

  it.each([["2026-11-01"], ["2026-11-02"], ["2026-11-11"], ["2026-12-01"]])(
    "el %s (fuera de las ventanas) → nada",
    (hoy) => {
      expect(avisoSinConfirmarQueToca(grupo, dia(hoy), TZ)).toBeNull();
    }
  );

  it("cuenta días en la zona de la academia, no en UTC", () => {
    // 2026-11-10 01:00 UTC es todavía el 9 a las 22:00 en Montevideo: falta 1 día.
    expect(avisoSinConfirmarQueToca(grupo, new Date("2026-11-10T01:00:00.000Z"), TZ)).toBe(
      "sin_confirmar_t2"
    );
    // 2026-11-10 04:00 UTC ya es el 10 a la 01:00 en Montevideo: es el día de inicio.
    expect(avisoSinConfirmarQueToca(grupo, new Date("2026-11-10T04:00:00.000Z"), TZ)).toBe(
      "sin_confirmar_inicio"
    );
  });

  it("un grupo confirmado no avisa nunca", () => {
    const confirmado = { ...grupo, confirmedAt: new Date("2026-11-01T12:00:00.000Z") };
    for (const hoy of ["2026-11-03", "2026-11-08", "2026-11-10"]) {
      expect(avisoSinConfirmarQueToca(confirmado, dia(hoy), TZ)).toBeNull();
    }
  });

  it("zona inválida → nada (nunca lanza)", () => {
    expect(avisoSinConfirmarQueToca(grupo, dia("2026-11-08"), "No/Existe")).toBeNull();
  });
});

describe("qué grupos reciben el aviso", () => {
  it("cursos y especializaciones, sí", () => {
    expect(grupoRecibeAvisoSinConfirmar({ courseKind: "curso", parentCohortId: null })).toBe(true);
    expect(grupoRecibeAvisoSinConfirmar({ courseKind: null, parentCohortId: null })).toBe(true);
  });

  it("un taller no (no es una cursada) y un módulo tampoco (se confirma el programa)", () => {
    expect(grupoRecibeAvisoSinConfirmar({ courseKind: "taller", parentCohortId: null })).toBe(false);
    expect(grupoRecibeAvisoSinConfirmar({ courseKind: "modulo", parentCohortId: "coh_madre" })).toBe(false);
    expect(grupoRecibeAvisoSinConfirmar({ courseKind: "curso", parentCohortId: "coh_madre" })).toBe(false);
  });
});

describe("idempotencia: una llave por grupo, ventana y fecha de inicio", () => {
  it("la llave lleva el día de inicio guardado", () => {
    expect(inicioDeLaClave(inicio)).toBe("2026-11-10");
    const s = sujetoSinConfirmar("coh_1", "sin_confirmar_t7", inicio);
    expect(claveDeAviso(s)).toBe("sin_confirmar_t7:coh_1:2026-11-10");
    expect(columnasDelSujeto(s)).toEqual({
      cohortId: "coh_1",
      enrollmentId: null,
      paymentId: null,
      periodKey: null,
      contactId: null,
    });
  });

  it("cada ventana tiene su llave, y reprogramar abre llaves nuevas", () => {
    const t7 = claveDeAviso(sujetoSinConfirmar("coh_1", "sin_confirmar_t7", inicio));
    const t2 = claveDeAviso(sujetoSinConfirmar("coh_1", "sin_confirmar_t2", inicio));
    const reprogramado = claveDeAviso(
      sujetoSinConfirmar("coh_1", "sin_confirmar_t7", new Date("2026-12-01T00:00:00.000Z"))
    );
    expect(new Set([t7, t2, reprogramado]).size).toBe(3);
  });

  it("se reconstruye desde la fila", () => {
    const s = sujetoSinConfirmar("coh_1", "sin_confirmar_inicio", inicio);
    const fila = { kind: s.kind, ...columnasDelSujeto(s), dedupKey: claveDeAviso(s) };
    expect(sujetoDeRegistro(fila)).toEqual(s);
    expect(sujetoDeRegistro({ ...fila, dedupKey: "sin_confirmar_inicio:coh_1:" })).toBeNull();
    expect(sujetoDeRegistro({ ...fila, cohortId: null })).toBeNull();
  });

  it("son tipos de `staff_notice`, con rótulo, y la migración los admite", () => {
    for (const k of ["sin_confirmar_t7", "sin_confirmar_t2", "sin_confirmar_inicio"] as const) {
      expect(STAFF_NOTICE_KINDS).toContain(k);
      expect(STAFF_NOTICE_LABELS[k]).toBeTruthy();
    }
    const migracion = readFileSync("drizzle/0070_avisos_sin_confirmar.sql", "utf8");
    expect(migracion).toMatch(/sin_confirmar_inicio/);
    expect(migracion).toMatch(/staff_notice_subject_valid/);
    const schema = readFileSync("src/lib/db/schema.ts", "utf8");
    expect(schema).toMatch(/'sin_confirmar_t7','sin_confirmar_t2','sin_confirmar_inicio'/);
  });
});

describe("lo que la periódica decide en una pasada", () => {
  const hoy = dia("2026-11-08"); // T-2

  it("sin registro previo → la ventana de hoy", () => {
    expect(avisoSinConfirmarQueTocaHoy(grupo, null, hoy, TZ)).toBe("sin_confirmar_t2");
  });

  it("ya enviado → nada (aunque se vuelva a correr)", () => {
    const enviado = { status: "sent" as const, attempts: 1, claimedAt: hoy };
    expect(avisoSinConfirmarQueTocaHoy(grupo, enviado, hoy, TZ)).toBeNull();
  });

  it("fallado con intentos restantes → se reintenta; agotado → no", () => {
    expect(avisoSinConfirmarQueTocaHoy(grupo, { status: "failed", attempts: 1, claimedAt: hoy }, hoy, TZ)).toBe(
      "sin_confirmar_t2"
    );
    expect(avisoSinConfirmarQueTocaHoy(grupo, { status: "failed", attempts: 3, claimedAt: hoy }, hoy, TZ)).toBeNull();
  });

  it("omitido (nadie con la capacidad) → la periódica no insiste", () => {
    expect(avisoSinConfirmarQueTocaHoy(grupo, { status: "skipped", attempts: 1, claimedAt: hoy }, hoy, TZ)).toBeNull();
  });

  it("confirmado antes de la ventana → nada", () => {
    expect(avisoSinConfirmarQueTocaHoy({ ...grupo, confirmedAt: dia("2026-11-07") }, null, hoy, TZ)).toBeNull();
  });
});

describe("destinatarios: quien TIENE la capacidad, según la base o el código", () => {
  const roles = [
    { key: "direccion", capabilities: [...CAPABILITIES] },
    { key: "soporte", capabilities: ["academico.ver", "academico.editar"] },
    // Un rol creado desde la pantalla, con un nombre cualquiera.
    { key: "rol_x1", capabilities: ["cohortes.confirmar", "capacidad.que.ya.no.existe"] },
  ];

  it("se decide por capacidad: el nombre del rol no importa", () => {
    const r = correosConCapacidad(
      [
        { email: "dire@academia.test", role: "direccion" },
        { email: "sop@academia.test", role: "soporte" },
        { email: "coord@academia.test", role: "rol_x1" },
      ],
      roles,
      "cohortes.confirmar"
    );
    expect(r).toEqual(["dire@academia.test", "coord@academia.test"]);
  });

  it("sin rol sembrado manda el mapeo de código (owner sí, soporte no, desconocido no)", () => {
    const r = correosConCapacidad(
      [
        { email: "owner@academia.test", role: "owner" },
        { email: "sop@academia.test", role: "soporte" },
        { email: "raro@academia.test", role: "inventado" },
      ],
      [],
      "cohortes.confirmar"
    );
    expect(r).toEqual(["owner@academia.test"]);
  });

  it("la fila de la base gana sobre el código (aunque el rol se llame owner)", () => {
    const r = correosConCapacidad(
      [{ email: "owner@academia.test", role: "owner" }],
      [{ key: "owner", capabilities: ["academico.ver"] }],
      "cohortes.confirmar"
    );
    expect(r).toEqual([]);
  });

  it("sin repetidos (sin distinguir mayúsculas) y sin correos vacíos", () => {
    const r = correosConCapacidad(
      [
        { email: "Dire@Academia.test", role: "direccion" },
        { email: "dire@academia.test", role: "direccion" },
        { email: "  ", role: "direccion" },
        { email: null, role: "direccion" },
      ],
      roles,
      "cohortes.confirmar"
    );
    expect(r).toEqual(["Dire@Academia.test"]);
  });

  it("no compara nombres de rol en el código", () => {
    const src = readFileSync("src/lib/avisos-sin-confirmar.ts", "utf8");
    expect(src).not.toMatch(/role\s*===\s*["']/);
    expect(src).not.toMatch(/["'](owner|direccion|coordinacion|soporte)["']/);
  });
});

describe("el correo", () => {
  const datos = {
    curso: "Revit Arquitectura",
    cohorte: "Noche 2026",
    startDate: inicio,
    startTime: "18:30",
    timeZone: TZ,
    inscriptos: 4,
    url: "https://crm.academia.test/cohorts/coh_1",
  };

  it("asunto con el grupo, la ventana y la fecha", () => {
    expect(armarAvisoSinConfirmar("sin_confirmar_t7", datos).subject).toBe(
      "[Académico] Grupo sin confirmar (faltan 7 días): Revit Arquitectura — Noche 2026 · inicia 10/11/2026"
    );
    expect(armarAvisoSinConfirmar("sin_confirmar_t2", datos).subject).toContain("faltan 2 días");
    expect(armarAvisoSinConfirmar("sin_confirmar_inicio", datos).subject).toContain("empieza hoy");
  });

  it("trae curso, grupo, inicio con hora en la zona, inscriptos y el enlace", () => {
    const { html } = armarAvisoSinConfirmar("sin_confirmar_t2", datos);
    expect(html).toContain("Revit Arquitectura");
    expect(html).toContain("Noche 2026");
    expect(html).toContain("martes 10 de noviembre de 2026");
    expect(html).toContain("18:30");
    expect(html).toContain("4 inscriptos");
    expect(html).toContain('href="https://crm.academia.test/cohorts/coh_1"');
  });

  it("concuerda en singular y dice cuando no hay nadie", () => {
    expect(armarAvisoSinConfirmar("sin_confirmar_t2", { ...datos, inscriptos: 1 }).html).toContain("1 inscripto");
    expect(armarAvisoSinConfirmar("sin_confirmar_t2", { ...datos, inscriptos: 1 }).html).not.toContain(
      "1 inscriptos"
    );
    expect(armarAvisoSinConfirmar("sin_confirmar_t2", { ...datos, inscriptos: 0 }).html).toContain(
      "Todavía no tiene inscriptos"
    );
  });

  it("escapa el nombre del grupo", () => {
    const { html } = armarAvisoSinConfirmar("sin_confirmar_t2", { ...datos, cohorte: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
