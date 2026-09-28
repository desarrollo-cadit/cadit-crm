/**
 * 029 — El tablero de Recorrido: qué dice cada celda alumno × módulo.
 *
 * PURA y en `lib/`: la usan la pestaña Recorrido y el resumen "Todos" de
 * Asistencia y Evaluación, y dos pantallas que decidan por su cuenta qué es
 * "cursando" terminan diciendo cosas distintas de la misma persona.
 *
 * El estado se dice con PALABRAS; el color de la insignia acompaña. Y nada de
 * plata: la celda habla de cursar, no de pagar (FR-008).
 */

export type IntentoDeModulo = {
  cohortId: string | null;
  courseId: string | null;
  /**
   * 030 — `sin_datos`: nadie cargó evaluaciones obligatorias ni asistencia.
   * NO es aprobado: el default optimista de la planilla, en una grilla sobre
   * personas, se leía como "aprobó este módulo".
   */
  state: "aprobado" | "reprobado" | "pendiente" | "sin_datos";
  reasons: string[];
  attendancePct: number | null;
  minAttendancePct: number | null;
  dispensada: boolean;
  otraCamada: boolean;
  camadaName: string | null;
};

export type ColumnaDeModulo = {
  cohortId: string;
  courseId: string;
  startDate: string | null;
  endDate: string | null;
};

export type TipoDeCelda =
  | "aprobado"
  | "cursando"
  | "reprobado"
  | "pendiente"
  | "sin_datos"
  | "baja"
  | "recursa"
  | "sin_cursada";

export type VarianteDeCelda = "success" | "destructive" | "warning" | "secondary" | "outline";

export type Celda = {
  kind: TipoDeCelda;
  label: string;
  variant: VarianteDeCelda;
  /** Asistencia, dispensa y motivos: lo que se lee al pasar el mouse. */
  title: string;
  /** A qué módulo lleva el clic: la corrida que la persona cursa de verdad. */
  href: string | null;
};

const VARIANTE: Record<TipoDeCelda, VarianteDeCelda> = {
  aprobado: "success",
  cursando: "secondary",
  reprobado: "destructive",
  pendiente: "outline",
  // Neutra: no es un logro ni una falta, es un dato que no está.
  sin_datos: "outline",
  baja: "warning",
  recursa: "warning",
  sin_cursada: "outline",
};

/**
 * Los intentos de una persona que caen bajo esta columna: primero por la
 * corrida exacta y, si no, por CURSO — quien recursó el módulo 2 con otra
 * camada cursó ese mismo módulo en otra corrida.
 */
export function intentosDeLaColumna<T extends IntentoDeModulo>(
  modulos: readonly T[],
  columna: Pick<ColumnaDeModulo, "cohortId" | "courseId">
): T[] {
  return modulos.filter(
    (m) => m.cohortId === columna.cohortId || m.courseId === columna.courseId
  );
}

/** El intento VIGENTE: el último que no quedó reprobado, o el último a secas. */
export function intentoVigente<T extends IntentoDeModulo>(intentos: readonly T[]): T | undefined {
  return [...intentos].reverse().find((i) => i.state !== "reprobado") ?? intentos[intentos.length - 1];
}

/** Lo que se lee al pasar el mouse sobre una celda `sin_datos`. */
const SIN_DATOS =
  "Nadie cargó todavía evaluaciones ni asistencia de este módulo: no es aprobado ni reprobado";

function tituloDe(i: IntentoDeModulo): string {
  // "0% porque nadie pasó lista no es 0% porque no vino": sin dato se dice.
  const asistencia =
    i.attendancePct === null
      ? "Asistencia: sin datos"
      : `Asistencia: ${i.attendancePct}%${
          i.minAttendancePct === null ? "" : ` (mínimo ${i.minAttendancePct}%)`
        }`;
  return [asistencia, i.dispensada ? "con dispensa" : null, ...i.reasons]
    .filter((x): x is string => !!x)
    .join(" · ");
}

export function estadoDeCelda(
  intentos: readonly IntentoDeModulo[],
  columna: ColumnaDeModulo,
  ahora: Date
): Celda {
  if (intentos.length === 0) {
    return {
      kind: "sin_cursada",
      label: "Sin cursada",
      variant: VARIANTE.sin_cursada,
      title: "No tiene este módulo cargado",
      href: null,
    };
  }

  const vigente = intentoVigente(intentos)!;
  const href = `/cohorts/${vigente.cohortId ?? columna.cohortId}`;
  const title = tituloDe(vigente);
  const celda = (kind: TipoDeCelda, label: string): Celda => ({
    kind,
    label,
    variant: VARIANTE[kind],
    title,
    href,
  });
  const otra = vigente.camadaName ?? "otra camada";

  if (intentos.length > 1) {
    if (vigente.state === "aprobado") return celda("aprobado", "Aprobado (recursó)");
    if (vigente.state === "reprobado") return celda("reprobado", "Reprobado");
    return celda("recursa", `Recursa en ${otra}`);
  }

  if (vigente.state === "aprobado") return celda("aprobado", "Aprobado");
  if (vigente.state === "reprobado") return celda("reprobado", "Reprobado");
  if (vigente.otraCamada) return celda("baja", `Baja → ${otra}`);
  if (vigente.state === "sin_datos") {
    // El título de siempre diría "Asistencia: sin datos" más el motivo del
    // servidor: la misma frase dos veces. Acá alcanza con una.
    return { ...celda("sin_datos", "Sin datos"), title: SIN_DATOS };
  }

  const empezo = columna.startDate !== null && new Date(columna.startDate) <= ahora;
  const termino = columna.endDate !== null && new Date(columna.endDate) < ahora;
  return empezo && !termino ? celda("cursando", "Cursando") : celda("pendiente", "Pendiente");
}
