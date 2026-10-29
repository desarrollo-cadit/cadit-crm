import { describe, expect, it } from "vitest";
import {
  armarConstancia,
  asistenciaDeAlumno,
  avisosDeGrupo,
  corteSchema,
  diasSinClase,
  estadoDeGrupoAlCorte,
  fechaCorta,
  fechaLarga,
  frecuenciaDeGrupo,
  listaDeFechas,
  nombreDeAlumno,
  normalizarConfigDeConstancias,
  relojDeCorte,
  type AlumnoDeConstancia,
  type ClaseDeConstancia,
  type EntradaDeConstancia,
  type GrupoDeConstancia,
} from "@/lib/constancia-empresa";
import type { AttendanceStatus } from "@/lib/attendance-percentage";

const TZ = "America/Montevideo";
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Lunes, miércoles y viernes del 27/10 al 21/11/2025; el 12 y el 14/11 canceladas. */
const FECHAS = [
  "2025-10-27", "2025-10-29", "2025-10-31", "2025-11-03", "2025-11-05", "2025-11-07",
  "2025-11-10", "2025-11-12", "2025-11-14", "2025-11-17", "2025-11-19", "2025-11-21",
];
const CANCELADAS = new Set(["2025-11-12", "2025-11-14"]);

const clases: ClaseDeConstancia[] = FECHAS.map((f) => ({
  id: `cls_${f}`,
  date: dia(f),
  endTime: "12:00",
  canceledAt: CANCELADAS.has(f) ? dia("2025-11-01") : null,
  tomada: true,
}));
const dictadas = FECHAS.filter((f) => !CANCELADAS.has(f));

function alumno(
  nombre: [string, string | null],
  marcas: Record<string, AttendanceStatus>,
  over: Partial<AlumnoDeConstancia> = {}
): AlumnoDeConstancia {
  return {
    enrollmentId: `enr_${nombre[0]}`,
    firstName: nombre[0],
    lastName: nombre[1],
    enrolledAt: dia("2025-10-01"),
    marcas: Object.entries(marcas).map(([f, status]) => ({ classSessionId: `cls_${f}`, status })),
    resultadoConfirmado: null,
    ...over,
  };
}

const todasPresente = (excepto: Record<string, AttendanceStatus> = {}) =>
  Object.fromEntries(dictadas.map((f) => [f, excepto[f] ?? ("presente" as AttendanceStatus)]));

function grupo(over: Partial<GrupoDeConstancia> = {}): GrupoDeConstancia {
  return {
    cohortId: "coh_1",
    curso: "AP3D",
    grupo: "Nube de Puntos",
    startDate: dia("2025-10-27"),
    endDate: dia("2025-11-21"),
    daysOfWeek: "0,2,4",
    startTime: "09:00",
    endTime: "12:00",
    clases,
    recesos: [],
    alumnos: [
      alumno(["Andres Sebastian", "Lemaire Guigou"], todasPresente({ "2025-10-29": "ausente", "2025-11-03": "ausente" })),
    ],
    ...over,
  };
}

const FINAL = { timeZone: TZ, now: new Date("2026-10-26T15:00:00.000Z") };

function entrada(over: Partial<EntradaDeConstancia> = {}): EntradaDeConstancia {
  return {
    empresa: "ANCAP",
    academia: "CadIT",
    ciudad: "Montevideo",
    emitidaEl: "2026-10-26",
    corte: "2026-10-26",
    reloj: FINAL,
    alcance: "grupo",
    grupos: [grupo()],
    firma: { nombre: "Natalie Frider", cargo: "Coordinación de cursos" },
    pie: ["Dirección: Bvr. Artigas 922, Montevideo – Uruguay"],
    ...over,
  };
}

describe("fechas en castellano", () => {
  it("fecha larga y corta", () => {
    expect(fechaLarga(dia("2026-10-26"))).toBe("26 de octubre de 2026");
    expect(fechaLarga(dia("2025-11-21"), { sinAño: true })).toBe("21 de noviembre");
    expect(fechaCorta(dia("2025-11-03"))).toBe("03/11");
  });

  it("lista de días agrupa por mes", () => {
    expect(listaDeFechas([dia("2025-11-12")])).toBe("12 de noviembre");
    expect(listaDeFechas([dia("2025-11-14"), dia("2025-11-12")])).toBe("12 y 14 de noviembre");
    expect(listaDeFechas([dia("2025-10-31"), dia("2025-11-12"), dia("2025-11-14")])).toBe(
      "31 de octubre y 12 y 14 de noviembre"
    );
  });

  it("frecuencia cuenta los días desde el LUNES", () => {
    expect(frecuenciaDeGrupo(grupo())).toBe("lunes, miércoles y viernes de 9:00 a 12:00");
    expect(frecuenciaDeGrupo(grupo({ daysOfWeek: "1", startTime: null }))).toBe("martes");
    expect(frecuenciaDeGrupo(grupo({ daysOfWeek: null }))).toBeNull();
  });

  it("apellido en mayúsculas primero", () => {
    expect(nombreDeAlumno({ firstName: "Andres Sebastian", lastName: "Lemaire Guigou" })).toBe(
      "LEMAIRE GUIGOU, Andres Sebastian"
    );
    expect(nombreDeAlumno({ firstName: "Ana", lastName: null })).toBe("Ana");
  });
});

describe("relojDeCorte", () => {
  it("el corte es el fin de ese día en la academia, nunca después de ahora", () => {
    const ahora = new Date("2026-10-29T13:00:00.000Z");
    const pasado = relojDeCorte("2025-11-07", TZ, ahora);
    expect(pasado.now.toISOString()).toBe("2025-11-08T03:00:00.000Z");
    expect(relojDeCorte("2026-10-29", TZ, ahora).now).toEqual(ahora);
    expect(relojDeCorte("2027-01-01", TZ, ahora).now).toEqual(ahora);
  });
});

describe("estado del grupo al corte", () => {
  it("finalizado, en curso y por comenzar", () => {
    expect(estadoDeGrupoAlCorte(grupo(), FINAL)).toBe("finalizada");
    expect(estadoDeGrupoAlCorte(grupo(), relojDeCorte("2025-11-07", TZ, FINAL.now))).toBe("en_curso");
    expect(estadoDeGrupoAlCorte(grupo(), relojDeCorte("2025-10-20", TZ, FINAL.now))).toBe("planificada");
  });
});

describe("asistencia de un alumno (la regla única)", () => {
  it("sin faltas, con algunas y con todas", () => {
    const g = grupo();
    const sinFaltas = asistenciaDeAlumno(g, alumno(["B", "B"], todasPresente()), FINAL);
    expect(sinFaltas).toMatchObject({ cuentan: 10, presentes: 10, pct: 100, faltas: [] });

    const algunas = asistenciaDeAlumno(g, g.alumnos[0]!, FINAL);
    expect(algunas.cuentan).toBe(10);
    expect(algunas.presentes).toBe(8);
    expect(algunas.pct).toBe(80);
    expect(algunas.faltas.map((f) => fechaCorta(f.fecha))).toEqual(["29/10", "03/11"]);

    const todas = asistenciaDeAlumno(
      g,
      alumno(["C", "C"], Object.fromEntries(dictadas.map((f) => [f, "ausente" as AttendanceStatus]))),
      FINAL
    );
    expect(todas).toMatchObject({ cuentan: 10, presentes: 0, pct: 0 });
    expect(todas.faltas).toHaveLength(10);
  });

  it("una clase dictada SIN lista tomada no es falta de nadie", () => {
    const g = grupo({
      clases: clases.map((c) => (c.id === "cls_2025-11-21" ? { ...c, tomada: false } : c)),
    });
    const b = alumno(["B", "B"], todasPresente());
    // Nadie pasó lista el 21: tampoco este alumno tiene marca ese día.
    b.marcas = b.marcas.filter((m) => m.classSessionId !== "cls_2025-11-21");
    const a = asistenciaDeAlumno(g, b, FINAL);
    expect(a.cuentan).toBe(9);
    expect(a.faltas).toEqual([]);
    expect(avisosDeGrupo(g, FINAL).clasesSinLista).toBe(1);
  });

  it("tarde cuenta como presente; justificado es falta y lo dice", () => {
    const a = asistenciaDeAlumno(
      grupo(),
      alumno(["D", "D"], todasPresente({ "2025-10-27": "tarde", "2025-10-31": "justificado" })),
      FINAL
    );
    expect(a.presentes).toBe(9);
    expect(a.faltas).toEqual([{ fecha: dia("2025-10-31"), justificada: true }]);
  });

  it("con lista tomada y sin marca propia cuenta como falta (como en todo el sistema) y se avisa", () => {
    const sinMarca = alumno(["E", "Sin Marca"], todasPresente());
    sinMarca.marcas = sinMarca.marcas.filter((m) => m.classSessionId !== "cls_2025-11-05");
    const g = grupo({ alumnos: [sinMarca] });
    expect(asistenciaDeAlumno(g, sinMarca, FINAL).faltas.map((f) => fechaCorta(f.fecha))).toEqual(["05/11"]);
    expect(avisosDeGrupo(g, FINAL).alumnosSinMarca).toEqual(["SIN MARCA, E"]);
  });
});

describe("días sin clase", () => {
  it("las canceladas dentro del período", () => {
    expect(diasSinClase(grupo(), FINAL).map((d) => fechaCorta(d))).toEqual(["12/11", "14/11"]);
  });

  it("los recesos que caen en días de clase y no generaron clase", () => {
    const g = grupo({
      clases: clases.filter((c) => !CANCELADAS.has(c.date.toISOString().slice(0, 10))),
      recesos: [{ fromDate: "2025-11-11", toDate: "2025-11-15" }],
    });
    // 11 (mar), 13 (jue) y 15 (sáb) no son días de clase.
    expect(diasSinClase(g, FINAL).map((d) => fechaCorta(d))).toEqual(["12/11", "14/11"]);
  });

  it("no mira más allá del corte", () => {
    expect(diasSinClase(grupo(), relojDeCorte("2025-11-07", TZ, FINAL.now))).toEqual([]);
  });
});

describe("armarConstancia — grupo finalizado", () => {
  const c = armarConstancia(entrada());
  const b = c.bloques[0]!;

  it("encabezado de carta formal", () => {
    expect(c.lugarYFecha).toBe("Montevideo, 26 de octubre de 2026");
    expect(c.destinatario).toEqual(["Señores", "ANCAP", "Presente"]);
    expect(c.asunto).toBe("Asunto: CAPACITACIÓN AP3D - NUBE DE PUNTOS");
    expect(c.saludo).toBe("De nuestra mayor consideración,");
    expect(b.titulo).toBeNull();
  });

  it("redacta en pasado con clases, frecuencia, días sin clase y fin", () => {
    expect(b.parrafos).toEqual([
      "Le informamos que hemos brindado una capacitación de AP3D - Nube de Puntos, realizada en 10 clases.",
      "La fecha de inicio fue 27 de octubre de 2025. La frecuencia fue lunes, miércoles y viernes de 9:00 a 12:00.",
      "Los días 12 y 14 de noviembre no se brindó clase, finalizando el 21 de noviembre.",
    ]);
    expect(b.encabezadoLista).toBe("Participaron del mismo:");
  });

  it("la línea del alumno separa asistencia y resultado, sin nota", () => {
    expect(b.alumnos).toEqual([
      "LEMAIRE GUIGOU, Andres Sebastian: participó de todas las clases a excepción del 29/10 y 03/11; asistió a 8 de 10 clases (80%). Resultado pendiente.",
    ]);
    expect(b.tabla).toEqual([
      { alumno: "LEMAIRE GUIGOU, Andres Sebastian", asistencia: "8/10", porcentaje: "80%", faltas: "2", resultado: "Resultado pendiente" },
    ]);
  });

  it("cierre y firma", () => {
    expect(c.cierre).toEqual([
      "A su solicitud y a los efectos de presentar ante ustedes, se expide esta constancia.",
      "Sin otro particular y quedando a las órdenes, los saluda muy atentamente.",
    ]);
    expect(c.firma).toEqual({ nombre: "Natalie Frider", cargo: "Coordinación de cursos" });
  });

  it("sin el día sin clase dice cuándo finalizó", () => {
    const sin = armarConstancia(entrada({ grupos: [grupo({ clases: clases.filter((x) => !x.canceledAt) })] }));
    expect(sin.bloques[0]!.parrafos[2]).toBe("La capacitación finalizó el 21 de noviembre.");
  });
});

describe("resultado: nunca aprobado sin confirmación", () => {
  const conResultado = (r: AlumnoDeConstancia["resultadoConfirmado"]) =>
    armarConstancia(
      entrada({ grupos: [grupo({ alumnos: [alumno(["B", "B"], todasPresente(), { resultadoConfirmado: r })] })] })
    ).bloques[0]!.tabla[0]!.resultado;

  it("100% de asistencia sin confirmación sigue pendiente", () => {
    expect(conResultado(null)).toBe("Resultado pendiente");
  });
  it("confirmado por el profesor", () => {
    expect(conResultado("aprobado")).toBe("Aprobado");
    expect(conResultado("reprobado")).toBe("Reprobado");
  });
  it("en curso no informa resultado aunque esté confirmado", () => {
    const c = armarConstancia(
      entrada({
        reloj: relojDeCorte("2025-11-07", TZ, FINAL.now),
        corte: "2025-11-07",
        grupos: [grupo({ alumnos: [alumno(["B", "B"], todasPresente(), { resultadoConfirmado: "aprobado" })] })],
      })
    );
    expect(c.bloques[0]!.tabla[0]!.resultado).toBe("En curso");
  });
});

describe("armarConstancia — grupo en curso", () => {
  const c = armarConstancia(
    entrada({
      corte: "2025-11-07",
      reloj: relojDeCorte("2025-11-07", TZ, FINAL.now),
      grupos: [
        grupo({
          alumnos: [
            alumno(["B", "Bueno"], todasPresente()),
            alumno(["C", "Cero"], Object.fromEntries(dictadas.map((f) => [f, "ausente" as AttendanceStatus]))),
          ],
        }),
      ],
    })
  );
  const b = c.bloques[0]!;

  it("redacta en presente y dice cuántas se dictaron de cuántas", () => {
    expect(b.estado).toBe("en_curso");
    expect(b.parrafos).toEqual([
      "Le informamos que estamos brindando una capacitación de AP3D - Nube de Puntos, prevista en 10 clases.",
      "La fecha de inicio fue 27 de octubre de 2025. La frecuencia es lunes, miércoles y viernes de 9:00 a 12:00.",
      "La capacitación se encuentra en curso: al 7 de noviembre de 2025 se dictaron 6 de 10 clases.",
    ]);
    expect(b.encabezadoLista).toBe("Participan del mismo:");
  });

  it("todas y ninguna", () => {
    expect(b.alumnos).toEqual([
      "BUENO, B: participó de todas las clases; asistió a 6 de 6 clases (100%). En curso.",
      "CERO, C: no participó de ninguna de las clases dictadas; asistió a 0 de 6 clases (0%). En curso.",
    ]);
    expect(b.tabla[1]).toEqual({ alumno: "CERO, C", asistencia: "0/6", porcentaje: "0%", faltas: "6", resultado: "En curso" });
  });
});

describe("armarConstancia — por comenzar y sin registro", () => {
  it("un grupo que todavía no empezó", () => {
    const c = armarConstancia(
      entrada({ corte: "2025-10-20", reloj: relojDeCorte("2025-10-20", TZ, FINAL.now) })
    );
    const b = c.bloques[0]!;
    expect(b.parrafos[0]).toBe(
      "Le informamos que la capacitación de AP3D - Nube de Puntos comenzará el 27 de octubre de 2025, prevista en 10 clases."
    );
    expect(b.alumnos[0]).toBe("LEMAIRE GUIGOU, Andres Sebastian.");
    expect(b.tabla[0]!.resultado).toBe("Por comenzar");
  });

  /**
   * 2026-10-29 — Además, un grupo TERMINADO sin la lista completa no tiene
   * resultado: "Sin datos", nunca "Resultado pendiente".
   */
  it("dictadas sin lista tomada: sin asistencia registrada, nunca 0%, y sin resultado", () => {
    const c = armarConstancia(
      entrada({
        grupos: [grupo({ clases: clases.map((x) => ({ ...x, tomada: false })), alumnos: [alumno(["B", "B"], {})] })],
      })
    );
    expect(c.bloques[0]!.alumnos[0]).toBe("B, B: sin asistencia registrada. Sin datos.");
    expect(c.bloques[0]!.tabla[0]).toMatchObject({ asistencia: "—", porcentaje: "—", faltas: "—" });
  });
});

describe("general vs. un grupo", () => {
  it("general: un bloque por grupo con título, mismo encabezado y cierre", () => {
    const otro = grupo({
      cohortId: "coh_2",
      curso: "Revit",
      grupo: "Revit 6",
      startDate: dia("2025-09-01"),
      endDate: dia("2025-09-30"),
      clases: [],
      alumnos: [alumno(["Z", "Zeta"], {})],
    });
    const c = armarConstancia(entrada({ alcance: "general", grupos: [grupo(), otro] }));
    expect(c.asunto).toBe("Asunto: CONSTANCIA DE CAPACITACIONES");
    expect(c.bloques.map((b) => b.titulo)).toEqual(["Revit - Revit 6", "AP3D - Nube de Puntos"]);
    expect(c.cierre).toHaveLength(2);
  });

  it("el nombre del grupo igual al del curso no se repite", () => {
    const c = armarConstancia(entrada({ grupos: [grupo({ grupo: "AP3D" })] }));
    expect(c.asunto).toBe("Asunto: CAPACITACIÓN AP3D");
  });

  it("alumnos ordenados por apellido", () => {
    const c = armarConstancia(
      entrada({ grupos: [grupo({ alumnos: [alumno(["Z", "Zeta"], {}), alumno(["A", "Álvarez"], {})] })] })
    );
    expect(c.bloques[0]!.tabla.map((t) => t.alumno)).toEqual(["ÁLVAREZ, A", "ZETA, Z"]);
  });
});

describe("sin una sola marca de la persona", () => {
  it("no se informa 0%: sin asistencia registrada, y el staff lo ve", () => {
    const nadie = alumno(["N", "Nadie"], {});
    const g = grupo({ alumnos: [nadie] });
    expect(asistenciaDeAlumno(g, nadie, FINAL)).toMatchObject({ cuentan: 0, pct: null, faltas: [] });
    expect(armarConstancia(entrada({ grupos: [g] })).bloques[0]!.alumnos[0]).toBe(
      "NADIE, N: sin asistencia registrada. Resultado pendiente."
    );
    expect(avisosDeGrupo(g, FINAL).alumnosSinMarca).toEqual(["NADIE, N"]);
  });
});

describe("corteSchema", () => {
  it("acepta un día real y rechaza lo demás", () => {
    expect(corteSchema.safeParse("2026-10-26").success).toBe(true);
    expect(corteSchema.safeParse("2026-02-30").success).toBe(false);
    expect(corteSchema.safeParse("26/10/2026").success).toBe(false);
  });
});

describe("configuración de constancias", () => {
  it("normaliza: sin firma es null, ciudad por defecto Montevideo, pie en líneas", () => {
    expect(normalizarConfigDeConstancias(null)).toEqual({
      firmaNombre: null,
      firmaCargo: null,
      ciudad: "Montevideo",
      pie: [],
    });
    expect(
      normalizarConfigDeConstancias({
        firmaNombre: "  Natalie Frider ",
        firmaCargo: "Coordinación de cursos",
        ciudad: "",
        pie: "Dirección: X\n\n  Teléfono: Y  ",
      })
    ).toEqual({
      firmaNombre: "Natalie Frider",
      firmaCargo: "Coordinación de cursos",
      ciudad: "Montevideo",
      pie: ["Dirección: X", "Teléfono: Y"],
    });
  });
});
