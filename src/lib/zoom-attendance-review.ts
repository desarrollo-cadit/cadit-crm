/**
 * Asistencia sugerida desde Zoom — el estado de la PANTALLA de revisión,
 * puro: quién quedó asignado a quién, qué estado elige la persona y el cuerpo
 * que se manda al confirmar. La verdad final la recalcula el servidor
 * (`planDeConfirmacion`); acá solo se arma la decisión humana.
 */

export type EstadoDeMarca = "presente" | "tarde" | "ausente" | "justificado";

export type AlumnoEnPantalla = {
  enrollmentId: string;
  nombre: string;
  sugerido: "presente" | "tarde" | "ausente";
  personas: string[];
  marcaActual: { status: EstadoDeMarca; source: "manual" | "zoom" | null } | null;
};

export type SugerenciaEnPantalla = {
  umbralMinutos: number;
  alumnos: AlumnoEnPantalla[];
  sinIdentificar: { key: string }[];
  personas: Record<string, { nombres: string[]; minutos: number }>;
};

/** persona → inscripción, `null` = nadie ("no es esta persona"), `"ignorar"` = equipo o dispositivo. */
export type Asignacion = Record<string, string | null | "ignorar">;

export type EstadoDeRevision = {
  asignacion: Asignacion;
  estados: Record<string, EstadoDeMarca>;
  /** Inscripciones con marca previa que se van a pisar a propósito. */
  pisar: string[];
};

export function estadoInicial(s: SugerenciaEnPantalla): EstadoDeRevision {
  const asignacion: Asignacion = {};
  for (const a of s.alumnos) for (const k of a.personas) asignacion[k] = a.enrollmentId;
  for (const p of s.sinIdentificar) asignacion[p.key] = null;
  const estados: Record<string, EstadoDeMarca> = {};
  for (const a of s.alumnos) estados[a.enrollmentId] = a.sugerido;
  return { asignacion, estados, pisar: [] };
}

export function personasDe(enrollmentId: string, asignacion: Asignacion): string[] {
  return Object.entries(asignacion)
    .filter(([, e]) => e === enrollmentId)
    .map(([k]) => k);
}

/**
 * Minutos de un alumno según lo asignado en pantalla. Con más de una persona
 * es una aproximación (el mayor): la unión exacta la calcula el servidor al
 * guardar.
 */
export function minutosEnPantalla(
  enrollmentId: string,
  asignacion: Asignacion,
  personas: SugerenciaEnPantalla["personas"]
): { minutos: number; aproximado: boolean } {
  const suyas = personasDe(enrollmentId, asignacion);
  return {
    minutos: Math.max(0, ...suyas.map((k) => personas[k]?.minutos ?? 0)),
    aproximado: suyas.length > 1,
  };
}

/**
 * Asigna una persona de Zoom a alguien del grupo (o la saca). El estado del
 * alumno que la recibe y del que la pierde se vuelve a sugerir por minutos,
 * salvo que alguien ya lo haya cambiado a mano.
 */
export function asignar(
  estado: EstadoDeRevision,
  s: SugerenciaEnPantalla,
  key: string,
  destino: string | null | "ignorar",
  tocadosAMano: ReadonlySet<string>
): EstadoDeRevision {
  const antes = estado.asignacion[key];
  const asignacion = { ...estado.asignacion, [key]: destino };
  const estados = { ...estado.estados };
  for (const enr of [antes, destino]) {
    if (!enr || enr === "ignorar" || tocadosAMano.has(enr)) continue;
    const { minutos } = minutosEnPantalla(enr, asignacion, s.personas);
    estados[enr] = minutos >= s.umbralMinutos ? "presente" : "ausente";
  }
  return { ...estado, asignacion, estados };
}

/** Lo que dice el pie antes de confirmar. */
export function resumenDeConfirmacion(s: SugerenciaEnPantalla, e: EstadoDeRevision) {
  const pisar = new Set(e.pisar);
  let aEscribir = 0;
  let sinTocar = 0;
  let aPisar = 0;
  for (const a of s.alumnos) {
    if (!a.marcaActual) aEscribir++;
    else if (pisar.has(a.enrollmentId)) aPisar++;
    else sinTocar++;
  }
  return { aEscribir, sinTocar, aPisar };
}

/** El cuerpo de `POST …/zoom-attendance/confirm`. */
export function cuerpoDeConfirmacion(s: SugerenciaEnPantalla, e: EstadoDeRevision) {
  const sugeridas = new Set(s.alumnos.flatMap((a) => a.personas));
  return {
    decisions: s.alumnos.map((a) => ({
      enrollmentId: a.enrollmentId,
      status: e.estados[a.enrollmentId] ?? a.sugerido,
      personaKeys: personasDe(a.enrollmentId, e.asignacion),
    })),
    ignore: Object.entries(e.asignacion)
      .filter(([, d]) => d === "ignorar")
      .map(([k]) => k),
    // Solo las que el sistema PROPONÍA para alguien y quedaron sin nadie: eso
    // es "no es esta persona". Un nombre sin identificar que nadie tocó no
    // enseña nada.
    rejected: Object.entries(e.asignacion)
      .filter(([k, d]) => d === null && sugeridas.has(k))
      .map(([k]) => k),
    overwrite: e.pisar,
  };
}
