import { z } from "zod";
import { grupoCompleto } from "@/lib/resultado-final";
import {
  attendancePercentage,
  claseCuentaParaElAlumno,
  cuentaComoPresente,
  estadoDeClase,
  type AttendanceStatus,
  type ClaseParaAsistencia,
  type RelojDeAsistencia,
} from "@/lib/attendance-percentage";
import { computeCohortStatus } from "@/lib/cohort-status";
import { fechaEnReceso, type Receso } from "@/lib/recess";
import {
  ETIQUETA_DE_RESULTADO,
  resultadoDeCursada,
  textoDeAsistencia,
  type EstadoDeGrupo,
  type ResultadoConfirmado,
} from "@/lib/resultado-de-cursada";
import { classEndsAt, wallClockInZone } from "@/lib/schedule-time";

/**
 * 2026-10-29 — La CONSTANCIA para una empresa: la carta formal que hoy se
 * escribe a mano para contarle a un cliente cómo les fue a sus empleados en
 * una capacitación.
 *
 * Todo lo que DECIDE vive acá, puro y sin base: qué clases cuentan al corte,
 * qué días faltó cada persona, qué días no hubo clase, si el grupo terminó y
 * qué resultado se informa. El PDF (`constancia-empresa-pdf.ts`) solo dibuja;
 * el servidor (`src/server/constancia-empresa.ts`) solo lee.
 *
 * Reglas que NO se reinventan acá:
 * - Qué clase cuenta para quién: `claseCuentaParaElAlumno` y
 *   `attendancePercentage` (la regla única). Una clase dictada sin lista
 *   tomada no es falta de nadie; con lista tomada y sin marca propia, cuenta
 *   como falta igual que en la planilla (si no, el % y la lista de días
 *   dirían cosas distintas). La pantalla lo avisa (`avisosDeGrupo`).
 * - Si el grupo terminó: `computeCohortStatus` al instante de corte.
 * - El resultado: `resultadoDeCursada` (la misma que la pantalla y el CSV de
 *   `/empresas`). Nunca "Aprobado" sin la confirmación del profesor.
 *
 * Sin plata: es un documento para un tercero.
 */

/* ============================================================
 * Entrada (datos planos que arma el servidor)
 * ============================================================ */

export type ClaseDeConstancia = {
  id: string;
  /** `class_session.date`: medianoche UTC del día. */
  date: Date;
  endTime: string | null;
  canceledAt: Date | null;
  /** ¿Alguien pasó lista en esta clase? (`asistenciaTomadaSql`). */
  tomada: boolean;
};

export type AlumnoDeConstancia = {
  enrollmentId: string;
  firstName: string;
  lastName: string | null;
  enrolledAt: Date | null;
  marcas: readonly { classSessionId: string; status: AttendanceStatus }[];
  resultadoConfirmado: ResultadoConfirmado;
};

export type GrupoDeConstancia = {
  cohortId: string;
  curso: string;
  grupo: string | null;
  startDate: Date;
  endDate: Date | null;
  /** "0,2,4" — cuenta desde el LUNES (`WEEKDAY_LABELS`). */
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  clases: readonly ClaseDeConstancia[];
  /** Los recesos que alcanzan a este grupo (`recesosDeCohorte`). */
  recesos: readonly Pick<Receso, "fromDate" | "toDate">[];
  alumnos: readonly AlumnoDeConstancia[];
};

export type FirmaDeConstancia = { nombre: string; cargo: string };

export type EntradaDeConstancia = {
  empresa: string;
  academia: string;
  ciudad: string;
  /** Día de emisión, "YYYY-MM-DD" en la zona de la academia. */
  emitidaEl: string;
  /** Fecha de corte, "YYYY-MM-DD". */
  corte: string;
  /** `relojDeCorte(corte, …)`: lo que decide qué clases ya se dieron. */
  reloj: RelojDeAsistencia;
  alcance: "general" | "grupo";
  grupos: readonly GrupoDeConstancia[];
  firma: FirmaDeConstancia | null;
  pie: readonly string[];
};

/* ============================================================
 * Salida (lo que se dibuja)
 * ============================================================ */

export type FilaDeTabla = {
  alumno: string;
  asistencia: string;
  porcentaje: string;
  faltas: string;
  resultado: string;
};

export type BloqueDeConstancia = {
  cohortId: string;
  /** Solo en la constancia general (un bloque por grupo). */
  titulo: string | null;
  estado: EstadoDeGrupo;
  parrafos: string[];
  encabezadoLista: string;
  alumnos: string[];
  tabla: FilaDeTabla[];
};

export type Constancia = {
  academia: string;
  empresa: string;
  lugarYFecha: string;
  destinatario: string[];
  asunto: string;
  saludo: string;
  bloques: BloqueDeConstancia[];
  cierre: string[];
  firma: FirmaDeConstancia | null;
  pie: string[];
};

/* ============================================================
 * Fechas y textos en castellano
 * ============================================================ */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/** "YYYY-MM-DD" → la medianoche UTC de ese día (como se guardan los días). */
export function diaIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Un DÍA guardado a medianoche UTC se lee en UTC: "26 de octubre de 2026". */
export function fechaLarga(d: Date, opts: { sinAño?: boolean } = {}): string {
  const base = `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return opts.sinAño ? base : `${base} de ${d.getUTCFullYear()}`;
}

/** "03/11". */
export function fechaCorta(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** "a", "a y b", "a, b y c". */
export function unirConY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** "12 y 14 de noviembre", "31 de octubre y 12 de noviembre". El año, solo si cambia. */
export function listaDeFechas(fechas: readonly Date[]): string {
  const orden = [...fechas].sort((a, b) => a.getTime() - b.getTime());
  const años = new Set(orden.map((d) => d.getUTCFullYear()));
  const grupos: { clave: string; dias: number[]; mes: number; año: number }[] = [];
  for (const d of orden) {
    const clave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.dias.push(d.getUTCDate());
    else grupos.push({ clave, dias: [d.getUTCDate()], mes: d.getUTCMonth(), año: d.getUTCFullYear() });
  }
  return unirConY(
    grupos.map(
      (g) =>
        `${unirConY(g.dias.map(String))} de ${MESES[g.mes]}${años.size > 1 ? ` de ${g.año}` : ""}`
    )
  );
}

function hora(hhmm: string | null): string | null {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim()) : null;
  return m ? `${Number(m[1])}:${m[2]}` : null;
}

function diasDeLaSemana(daysOfWeek: string | null): number[] {
  if (!daysOfWeek) return [];
  return [
    ...new Set(
      daysOfWeek
        .split(",")
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ),
  ].sort((a, b) => a - b);
}

/** "lunes, miércoles y viernes de 9:00 a 12:00". Sin días: `null`. */
export function frecuenciaDeGrupo(
  g: Pick<GrupoDeConstancia, "daysOfWeek" | "startTime" | "endTime">
): string | null {
  const dias = diasDeLaSemana(g.daysOfWeek);
  if (dias.length === 0) return null;
  const texto = unirConY(dias.map((d) => DIAS[d]!));
  const desde = hora(g.startTime);
  const hasta = hora(g.endTime);
  return desde && hasta ? `${texto} de ${desde} a ${hasta}` : texto;
}

/** "LEMAIRE GUIGOU, Andres Sebastian": apellido en mayúsculas primero. */
export function nombreDeAlumno(a: { firstName: string; lastName: string | null }): string {
  const nombre = a.firstName.trim();
  const apellido = a.lastName?.trim();
  return apellido ? `${apellido.toLocaleUpperCase("es")}, ${nombre}` : nombre;
}

function nClases(n: number): string {
  return `${n} ${n === 1 ? "clase" : "clases"}`;
}

function normalizado(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function tituloDeGrupo(g: Pick<GrupoDeConstancia, "curso" | "grupo">): string {
  return g.grupo && normalizado(g.grupo) !== normalizado(g.curso) ? `${g.curso} - ${g.grupo}` : g.curso;
}

/* ============================================================
 * Reglas
 * ============================================================ */

/**
 * El reloj del corte: el FIN del día de corte en la academia, pero nunca
 * después de ahora — con el corte en hoy, la clase de las 18:00 todavía no se
 * dio a las 10:00.
 */
export function relojDeCorte(corte: string, timeZone: string, ahora: Date): RelojDeAsistencia {
  const fin = classEndsAt(diaIso(corte), null, timeZone);
  return { timeZone, now: fin.getTime() < ahora.getTime() ? fin : ahora };
}

export function estadoDeGrupoAlCorte(
  g: Pick<GrupoDeConstancia, "startDate" | "endDate">,
  reloj: RelojDeAsistencia
): EstadoDeGrupo {
  return computeCohortStatus(g.startDate, g.endDate, reloj.now, reloj.timeZone);
}

function ordenadas<T extends { date: Date }>(clases: readonly T[]): T[] {
  return [...clases].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function paraAsistencia(c: ClaseDeConstancia, status: AttendanceStatus | null): ClaseParaAsistencia {
  return {
    sessionDate: c.date,
    endTime: c.endTime,
    canceled: Boolean(c.canceledAt),
    tomada: c.tomada,
    status,
  };
}

export type AsistenciaDeAlumno = {
  /** Clases dictadas que cuentan para esta persona (la regla única). */
  cuentan: number;
  presentes: number;
  /** `null` = ninguna clase cuenta (no es 0%). */
  pct: number | null;
  faltas: { fecha: Date; justificada: boolean }[];
  /** Faltas que lo son porque, con lista tomada, esta persona no tiene marca. */
  sinMarca: number;
};

export function asistenciaDeAlumno(
  g: Pick<GrupoDeConstancia, "clases">,
  a: Pick<AlumnoDeConstancia, "enrolledAt" | "marcas">,
  reloj: RelojDeAsistencia
): AsistenciaDeAlumno {
  const marca = new Map(a.marcas.map((m) => [m.classSessionId, m.status]));
  const sesiones = ordenadas(g.clases).map((c) => ({
    clase: c,
    s: paraAsistencia(c, marca.get(c.id) ?? null),
  }));
  const cuentan = sesiones.filter(({ s }) => claseCuentaParaElAlumno(s, a.enrolledAt, reloj));
  const faltas = cuentan.filter(({ s }) => !cuentaComoPresente(s.status));
  const sinMarca = faltas.filter(({ s }) => s.status === null).length;
  /**
   * Mismo criterio que el legajo y el reporte por empresa: sin UNA sola marca
   * de la persona no hay asistencia que informar (`null`, nunca 0%). Las
   * clases con lista tomada en las que no figura quedan en `sinMarca` para
   * que el staff lo vea.
   */
  if (a.marcas.length === 0) return { cuentan: 0, presentes: 0, pct: null, faltas: [], sinMarca };
  return {
    cuentan: cuentan.length,
    presentes: cuentan.length - faltas.length,
    pct: attendancePercentage(
      sesiones.map(({ s }) => s),
      a.enrolledAt,
      reloj
    ),
    faltas: faltas.map(({ clase, s }) => ({ fecha: clase.date, justificada: s.status === "justificado" })),
    sinMarca,
  };
}

/** El día de corte ("YYYY-MM-DD") en la zona de la academia. */
function diaDelReloj(reloj: RelojDeAsistencia): string {
  return wallClockInZone(reloj.now, reloj.timeZone)?.fecha ?? reloj.now.toISOString().slice(0, 10);
}

/**
 * Los días en que, debiendo haber clase, no la hubo, dentro del período del
 * grupo y hasta el corte: las clases canceladas y los días de receso que caen
 * en un día de cursada sin clase generada.
 */
export function diasSinClase(
  g: Pick<GrupoDeConstancia, "startDate" | "endDate" | "daysOfWeek" | "clases" | "recesos">,
  reloj: RelojDeAsistencia
): Date[] {
  const inicio = g.startDate.toISOString().slice(0, 10);
  const corte = diaDelReloj(reloj);
  const fin = g.endDate ? g.endDate.toISOString().slice(0, 10) : corte;
  const limite = fin < corte ? fin : corte;
  const dentro = (dia: string) => inicio <= dia && dia <= limite;

  const conClase = new Set(
    g.clases.filter((c) => !c.canceledAt).map((c) => c.date.toISOString().slice(0, 10))
  );
  const dias = new Set<string>();
  for (const c of g.clases) {
    const dia = c.date.toISOString().slice(0, 10);
    if (c.canceledAt && dentro(dia) && !conClase.has(dia)) dias.add(dia);
  }

  const semana = new Set(diasDeLaSemana(g.daysOfWeek));
  if (semana.size > 0 && g.recesos.length > 0) {
    const cursor = diaIso(inicio);
    const ultimo = diaIso(limite);
    while (cursor.getTime() <= ultimo.getTime()) {
      const dia = cursor.toISOString().slice(0, 10);
      const indice = (cursor.getUTCDay() + 6) % 7;
      if (semana.has(indice) && !conClase.has(dia) && fechaEnReceso(cursor, g.recesos)) dias.add(dia);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return [...dias].sort().map(diaIso);
}

export type AvisosDeGrupo = {
  /** Clases ya dictadas en las que nadie pasó lista: no cuentan para nadie. */
  clasesSinLista: number;
  /** Personas con faltas por no tener marca en una clase con lista tomada. */
  alumnosSinMarca: string[];
};

/** Lo que el staff tiene que saber ANTES de mandar la carta (nunca va al PDF). */
export function avisosDeGrupo(g: GrupoDeConstancia, reloj: RelojDeAsistencia): AvisosDeGrupo {
  return {
    clasesSinLista: g.clases.filter(
      (c) => !c.tomada && estadoDeClase(paraAsistencia(c, null), reloj) === "dictada"
    ).length,
    alumnosSinMarca: ordenarAlumnos(g.alumnos)
      .filter((a) => asistenciaDeAlumno(g, a, reloj).sinMarca > 0)
      .map(nombreDeAlumno),
  };
}

function ordenarAlumnos<T extends { firstName: string; lastName: string | null }>(alumnos: readonly T[]): T[] {
  const clave = (a: T) => `${a.lastName?.trim() ?? a.firstName.trim()} ${a.firstName.trim()}`;
  return [...alumnos].sort((a, b) => clave(a).localeCompare(clave(b), "es", { sensitivity: "base" }));
}

/* ============================================================
 * La carta
 * ============================================================ */

function bloque(g: GrupoDeConstancia, e: EntradaDeConstancia): BloqueDeConstancia {
  const reloj = e.reloj;
  const estado = estadoDeGrupoAlCorte(g, reloj);
  const titulo = tituloDeGrupo(g);
  const clases = ordenadas(g.clases);
  const dictadas = clases.filter((c) => estadoDeClase(paraAsistencia(c, null), reloj) === "dictada");
  const previstas = clases.filter((c) => !c.canceledAt).length || null;
  const frecuencia = frecuenciaDeGrupo(g);
  const inicio = fechaLarga(g.startDate);
  const sinClase = diasSinClase(g, reloj);
  const fraseSinClase =
    sinClase.length > 0
      ? `${sinClase.length === 1 ? "El día" : "Los días"} ${listaDeFechas(sinClase)} no se brindó clase`
      : null;

  const parrafos: string[] = [];
  let encabezadoLista: string;

  if (estado === "finalizada") {
    parrafos.push(
      `Le informamos que hemos brindado una capacitación de ${titulo}` +
        (dictadas.length > 0 ? `, realizada en ${nClases(dictadas.length)}.` : ".")
    );
    parrafos.push(
      `La fecha de inicio fue ${inicio}.` + (frecuencia ? ` La frecuencia fue ${frecuencia}.` : "")
    );
    const ultimo = dictadas[dictadas.length - 1]?.date ?? g.endDate;
    const fin = ultimo
      ? fechaLarga(ultimo, { sinAño: ultimo.getUTCFullYear() === g.startDate.getUTCFullYear() })
      : null;
    if (fraseSinClase) parrafos.push(fin ? `${fraseSinClase}, finalizando el ${fin}.` : `${fraseSinClase}.`);
    else if (fin) parrafos.push(`La capacitación finalizó el ${fin}.`);
    encabezadoLista = "Participaron del mismo:";
  } else if (estado === "en_curso") {
    parrafos.push(
      `Le informamos que estamos brindando una capacitación de ${titulo}` +
        (previstas ? `, prevista en ${nClases(previstas)}.` : ".")
    );
    parrafos.push(
      `La fecha de inicio fue ${inicio}.` + (frecuencia ? ` La frecuencia es ${frecuencia}.` : "")
    );
    if (fraseSinClase) parrafos.push(`${fraseSinClase}.`);
    const n = dictadas.length;
    parrafos.push(
      `La capacitación se encuentra en curso: al ${fechaLarga(diaIso(e.corte))} ` +
        `${n === 1 ? "se dictó" : "se dictaron"} ${previstas ? `${n} de ${nClases(previstas)}` : nClases(n)}.`
    );
    encabezadoLista = "Participan del mismo:";
  } else {
    parrafos.push(
      `Le informamos que la capacitación de ${titulo} comenzará el ${inicio}` +
        (previstas ? `, prevista en ${nClases(previstas)}.` : ".")
    );
    if (frecuencia) parrafos.push(`La frecuencia será ${frecuencia}.`);
    encabezadoLista = "Se encuentran inscriptos:";
  }

  const alumnos: string[] = [];
  const tabla: FilaDeTabla[] = [];
  for (const a of ordenarAlumnos(g.alumnos)) {
    const nombre = nombreDeAlumno(a);
    const resultado =
      ETIQUETA_DE_RESULTADO[
        resultadoDeCursada({
          estadoDelGrupo: estado,
          resultadoConfirmado: a.resultadoConfirmado,
          grupoCompleto: grupoCompleto(g.clases, reloj),
        })
      ];
    const asis = asistenciaDeAlumno(g, a, reloj);
    const texto = textoDeAsistencia(asis, false);

    if (estado === "planificada") {
      alumnos.push(`${nombre}.`);
    } else if (!texto) {
      alumnos.push(`${nombre}: sin asistencia registrada. ${resultado}.`);
    } else {
      const frase =
        asis.faltas.length === 0
          ? "participó de todas las clases"
          : asis.faltas.length === asis.cuentan
            ? "no participó de ninguna de las clases dictadas"
            : `participó de todas las clases a excepción del ${unirConY(
                asis.faltas.map((f) => `${fechaCorta(f.fecha)}${f.justificada ? " (justificada)" : ""}`)
              )}`;
      alumnos.push(`${nombre}: ${frase}; asistió a ${texto}. ${resultado}.`);
    }

    const conDatos = estado !== "planificada" && texto !== null;
    tabla.push({
      alumno: nombre,
      asistencia: conDatos ? `${asis.presentes}/${asis.cuentan}` : "—",
      porcentaje: conDatos ? `${asis.pct}%` : "—",
      faltas: conDatos ? String(asis.faltas.length) : "—",
      resultado,
    });
  }

  return {
    cohortId: g.cohortId,
    titulo: e.alcance === "general" ? titulo : null,
    estado,
    parrafos,
    encabezadoLista,
    alumnos,
    tabla,
  };
}

export function armarConstancia(e: EntradaDeConstancia): Constancia {
  const grupos = [...e.grupos].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const unico = e.alcance === "grupo" && grupos.length === 1 ? grupos[0] : undefined;
  return {
    academia: e.academia,
    empresa: e.empresa,
    lugarYFecha: `${e.ciudad}, ${fechaLarga(diaIso(e.emitidaEl))}`,
    destinatario: ["Señores", e.empresa, "Presente"],
    asunto: unico
      ? `Asunto: CAPACITACIÓN ${tituloDeGrupo(unico).toLocaleUpperCase("es")}`
      : "Asunto: CONSTANCIA DE CAPACITACIONES",
    saludo: "De nuestra mayor consideración,",
    bloques: grupos.map((g) => bloque(g, e)),
    cierre: [
      "A su solicitud y a los efectos de presentar ante ustedes, se expide esta constancia.",
      "Sin otro particular y quedando a las órdenes, los saluda muy atentamente.",
    ],
    firma: e.firma,
    pie: [...e.pie],
  };
}

/** "Constancia - ANCAP - Nube de Puntos - 2026-10-26.pdf", seguro para `Content-Disposition`. */
export function nombreDeArchivoConstancia(
  empresa: string,
  grupo: string | null,
  corte: string
): { ascii: string; utf8: string } {
  const base = `Constancia - ${empresa} - ${grupo ?? "General"} - ${corte}`
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    ascii: `${base.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}.pdf`,
    utf8: encodeURIComponent(`${base}.pdf`),
  };
}

/* ============================================================
 * Configuración (una vez por academia)
 * ============================================================ */

export type ConfigDeConstancias = {
  firmaNombre: string | null;
  firmaCargo: string | null;
  /** Ciudad del encabezado ("Montevideo, 26 de octubre de 2026"). */
  ciudad: string;
  /** Líneas del pie (dirección, teléfono, web, correo), en cada página. */
  pie: string[];
};

export const CIUDAD_POR_DEFECTO = "Montevideo";

/** La fecha de corte que llega por query: "YYYY-MM-DD" y un día que existe. */
export const corteSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de corte va como AAAA-MM-DD")
  .refine((iso) => {
    const d = diaIso(iso);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
  }, "La fecha de corte no existe");

export const configDeConstanciasSchema = z.object({
  firmaNombre: z.string().trim().max(80),
  firmaCargo: z.string().trim().max(80),
  ciudad: z.string().trim().max(60),
  /** Texto libre, una línea por renglón (máximo 4). */
  pie: z
    .string()
    .max(400)
    .refine((t) => t.split("\n").filter((l) => l.trim()).length <= 4, "Hasta 4 líneas en el pie"),
});

export function normalizarConfigDeConstancias(
  input: Partial<{ firmaNombre: unknown; firmaCargo: unknown; ciudad: unknown; pie: unknown }> | null
): ConfigDeConstancias {
  const texto = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const lineas = Array.isArray(input?.pie)
    ? input.pie.filter((l): l is string => typeof l === "string")
    : typeof input?.pie === "string"
      ? input.pie.split("\n")
      : [];
  return {
    firmaNombre: texto(input?.firmaNombre, 80),
    firmaCargo: texto(input?.firmaCargo, 80),
    ciudad: texto(input?.ciudad, 60) ?? CIUDAD_POR_DEFECTO,
    pie: lineas.map((l) => l.trim().slice(0, 120)).filter(Boolean).slice(0, 4),
  };
}

/** La firma solo existe con nombre; el cargo puede faltar. */
export function firmaDeConfig(c: ConfigDeConstancias): FirmaDeConstancia | null {
  return c.firmaNombre ? { nombre: c.firmaNombre, cargo: c.firmaCargo ?? "" } : null;
}
