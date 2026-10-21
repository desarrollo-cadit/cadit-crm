import { describe, expect, it } from "vitest";
import {
  attendancePercentage,
  claseCuentaParaElAlumno,
  estadoDeClase,
  type ClaseParaAsistencia,
} from "@/lib/attendance-percentage";
import { attendanceByModule } from "@/server/attendance";

/**
 * 2026-10-21 — El porcentaje de asistencia cuenta solo las clases YA DICTADAS.
 *
 * El caso real: un módulo de EBIM 14 con 12 clases (6/10 → 12/11), 5 dadas.
 * Quien fue a las 5 veía 42% (5/12): el denominador metía las 7 clases que
 * todavía no ocurrieron. "Dictada" es la MISMA regla que las horas dictadas
 * (`classHasEnded`, 663467f): terminó en la zona de la academia y no está
 * cancelada.
 */

const TZ = "America/Montevideo";
/** Miércoles 21/10/2026, mediodía en Montevideo. */
const AHORA = new Date("2026-10-21T15:00:00Z");
const RELOJ = { timeZone: TZ, now: AHORA };

/** Martes y jueves de 18:00 a 21:00; la clase 5 (20/10) ya terminó. */
const FECHAS = [
  "2026-10-06",
  "2026-10-08",
  "2026-10-13",
  "2026-10-15",
  "2026-10-20",
  "2026-10-22",
  "2026-10-27",
  "2026-10-29",
  "2026-11-03",
  "2026-11-05",
  "2026-11-10",
  "2026-11-12",
];

type Marca = "presente" | "tarde" | "ausente" | "justificado" | null;

/**
 * `tomadas`: en qué clases alguien pasó lista (al menos una marca de
 * cualquiera). Por defecto, las clases donde ESTE alumno tiene marca más las
 * 5 ya dictadas: el grupo tomó lista en todas.
 */
function planilla(marcas: Marca[], tomadas: readonly number[] = [0, 1, 2, 3, 4]): ClaseParaAsistencia[] {
  return FECHAS.map((f, i) => ({
    sessionDate: new Date(`${f}T00:00:00Z`),
    endTime: "21:00",
    canceled: false,
    status: marcas[i] ?? null,
    tomada: tomadas.includes(i) || Boolean(marcas[i]),
  }));
}

describe("attendancePercentage — solo cuentan las clases ya dictadas", () => {
  it("5 dadas de 12, presente en las 5 → 100%, no 42%", () => {
    expect(attendancePercentage(planilla(["presente", "presente", "presente", "presente", "presente"]), null, RELOJ)).toBe(100);
  });

  it("tarde cuenta como presente también con clases futuras", () => {
    expect(attendancePercentage(planilla(["presente", "presente", "tarde", "presente", "presente"]), null, RELOJ)).toBe(100);
  });

  /**
   * Decisión (se mantiene la de 009): una clase DICTADA sin marca para el
   * alumno cuenta como no presente. Si no contara, no tomar lista subiría el
   * porcentaje; el "sin datos" se cubre con el `null` de quien no tiene
   * ninguna marca (legajo, recorrido).
   */
  it("una clase dictada sin marca cuenta como no presente", () => {
    expect(attendancePercentage(planilla(["presente", "presente", "presente", "presente", null]), null, RELOJ)).toBe(80);
  });

  it("sin ninguna clase dictada todavía → null, no 0%", () => {
    const antes = { timeZone: TZ, now: new Date("2026-10-06T12:00:00Z") };
    expect(attendancePercentage(planilla([]), null, antes)).toBeNull();
  });

  it("la clase de hoy que todavía no terminó no cuenta", () => {
    // 22/10 a las 19:00 de Montevideo: la clase 6 está en curso.
    const enCurso = { timeZone: TZ, now: new Date("2026-10-22T22:00:00Z") };
    const pct = attendancePercentage(
      planilla(["presente", "presente", "presente", "presente", "presente", "presente"]),
      null,
      enCurso
    );
    expect(pct).toBe(100);
    expect(estadoDeClase(planilla([])[5]!, enCurso)).toBe("hoy");
  });

  it("las canceladas siguen fuera del denominador", () => {
    const clases = planilla(["presente", "presente", "presente", "presente", null]);
    clases[4] = { ...clases[4]!, canceled: true };
    expect(attendancePercentage(clases, null, RELOJ)).toBe(100);
  });
});

/**
 * Bug 2 — Dos alumnas del mismo módulo con porcentajes "imposibles":
 * Antonella (A,A,P,P,P) veía 13% y Belén (P×5) 36%, mientras el resto veía
 * 42%. No era otro denominador de clases: era `enrolled_at`. La inscripción
 * de Antonella se registró después de la clase 4 y la de Belén después de la
 * 1 —se cargaron en el CRM con la cursada ya en marcha—, y la regla "las
 * clases anteriores a la inscripción no cuentan" las sacaba del cálculo
 * AUNQUE TUVIERAN MARCA. Antonella: 1 presente sobre 8 elegibles = 13%;
 * Belén: 4 sobre 11 = 36%.
 *
 * La marca prueba que la persona estaba en esa clase: una clase con marca
 * cuenta siempre. Y "anterior a la inscripción" se pregunta contra el FIN de
 * la clase (inscripta el mismo día, antes de que termine, la clase cuenta).
 */
/**
 * 2026-10-21 (coordinación) — **0% porque nadie pasó lista NO es 0% porque no
 * vino.** Una clase dictada cuenta solo si se TOMÓ asistencia en ella (al
 * menos una marca de cualquiera). La captura del grupo "Grupo noche ·
 * Octubre" mostraba 0% a todos con 5 clases dadas y ninguna marca.
 */
describe("solo cuentan las clases donde se tomó asistencia", () => {
  it("nadie marcó nada → null, nunca 0%", () => {
    expect(attendancePercentage(planilla([], []), null, RELOJ)).toBeNull();
  });

  it("lista tomada solo en 3 de las 5 dadas: el denominador es 3", () => {
    const pct = attendancePercentage(
      planilla(["presente", "ausente", "presente"], [0, 1, 2]),
      null,
      RELOJ
    );
    expect(pct).toBe(67);
  });

  it("clase donde solo marcaron a otros: el alumno sin marca cuenta como ausente", () => {
    // Clases 1 y 2: él presente. Clase 3: lista tomada (a otros), él sin marca.
    const pct = attendancePercentage(planilla(["presente", "presente", null], [0, 1, 2]), null, RELOJ);
    expect(pct).toBe(67);
  });

  it("una clase dictada SIN lista tomada no cuenta aunque el alumno no tenga marca", () => {
    const clase = planilla([], [])[0]!;
    expect(claseCuentaParaElAlumno(clase, null, RELOJ)).toBe(false);
    expect(claseCuentaParaElAlumno({ ...clase, tomada: true }, null, RELOJ)).toBe(true);
  });
});

describe("bug 2 — la inscripción tardía no borra la asistencia marcada", () => {
  const ANTONELLA = { marcas: ["ausente", "ausente", "presente", "presente", "presente"] as Marca[], enrolledAt: new Date("2026-10-16T14:00:00Z") };
  const BELEN = { marcas: ["presente", "presente", "presente", "presente", "presente"] as Marca[], enrolledAt: new Date("2026-10-07T13:00:00Z") };

  it("reproduce lo que se veía con la regla vieja (13% y 36%)", () => {
    const vieja = (marcas: Marca[], enrolledAt: Date) => {
      const elegibles = planilla(marcas).filter((c) => c.sessionDate >= enrolledAt);
      const p = elegibles.filter((c) => c.status === "presente" || c.status === "tarde").length;
      return Math.round((p / elegibles.length) * 100);
    };
    expect(vieja(ANTONELLA.marcas, ANTONELLA.enrolledAt)).toBe(13);
    expect(vieja(BELEN.marcas, BELEN.enrolledAt)).toBe(36);
  });

  it("Antonella: 3 de 5 → 60%", () => {
    expect(attendancePercentage(planilla(ANTONELLA.marcas), ANTONELLA.enrolledAt, RELOJ)).toBe(60);
  });

  it("Belén: 5 de 5 → 100%", () => {
    expect(attendancePercentage(planilla(BELEN.marcas), BELEN.enrolledAt, RELOJ)).toBe(100);
  });

  it("sin marca, la clase anterior a la inscripción sigue sin contar", () => {
    const tarde = new Date("2026-10-16T14:00:00Z");
    expect(attendancePercentage(planilla([null, null, null, null, "presente"]), tarde, RELOJ)).toBe(100);
  });

  it("inscripta el mismo día, antes de que termine la clase: cuenta", () => {
    const clase = planilla([])[0]!;
    expect(claseCuentaParaElAlumno(clase, new Date("2026-10-06T15:00:00Z"), RELOJ)).toBe(true);
    expect(claseCuentaParaElAlumno(clase, new Date("2026-10-07T03:00:00Z"), RELOJ)).toBe(false);
  });

  it("el recorrido por módulo (vista Todos) da el mismo número", () => {
    const sesiones = FECHAS.map((f, i) => ({
      id: `cls_${i}`,
      cohortId: "coh_m1",
      date: new Date(`${f}T00:00:00Z`),
      endTime: "21:00",
      canceledAt: null,
    }));
    const marcas = (enrollmentId: string, ms: Marca[]) =>
      ms.flatMap((status, i) => (status ? [{ enrollmentId, classSessionId: `cls_${i}`, status }] : []));
    const pct = attendanceByModule(
      [
        { enrollmentId: "enr_a", cohortId: "coh_m1", enrolledAt: ANTONELLA.enrolledAt },
        { enrollmentId: "enr_b", cohortId: "coh_m1", enrolledAt: BELEN.enrolledAt },
      ],
      sesiones,
      [...marcas("enr_a", ANTONELLA.marcas), ...marcas("enr_b", BELEN.marcas)],
      RELOJ
    );
    expect(pct.get("enr_a")).toBe(60);
    expect(pct.get("enr_b")).toBe(100);
  });
});

describe("estadoDeClase — qué es cada columna de la planilla", () => {
  const clases = planilla([]);

  it("dictada, futura y cancelada", () => {
    expect(estadoDeClase(clases[0]!, RELOJ)).toBe("dictada");
    expect(estadoDeClase(clases[4]!, RELOJ)).toBe("dictada");
    expect(estadoDeClase(clases[5]!, RELOJ)).toBe("futura");
    expect(estadoDeClase({ ...clases[0]!, canceled: true }, RELOJ)).toBe("cancelada");
  });

  it("el día de la clase, antes de que termine, es 'hoy' (se puede pasar lista)", () => {
    const manana = { timeZone: TZ, now: new Date("2026-10-22T12:00:00Z") };
    expect(estadoDeClase(clases[5]!, manana)).toBe("hoy");
    // El día anterior en Montevideo (21/10 22:00 local = 22/10 01:00 UTC) sigue futura.
    const vispera = { timeZone: TZ, now: new Date("2026-10-22T01:00:00Z") };
    expect(estadoDeClase(clases[5]!, vispera)).toBe("futura");
  });
});
