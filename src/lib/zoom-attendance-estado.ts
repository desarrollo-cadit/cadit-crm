import type { ZoomErrorCode } from "@/lib/zoom";

/**
 * Asistencia sugerida desde Zoom — el estado de "traer de Zoom" de una clase,
 * puro: reintentos, a qué estado lleva cada error y qué dice la pantalla.
 * Un fallo NUNCA toca `attendance`: la asistencia se sigue pasando a mano.
 */

export type EstadoDeTraida =
  | "pendiente"
  | "lista"
  | "sin_reunion"
  | "ambigua"
  | "no_lista"
  | "sin_permiso"
  | "fuera_de_plazo"
  | "error";

/** Reintentos: 30 min → 2 h → 6 h → 24 h, y después se deja de intentar. */
export const ESPERAS_MIN = [30, 120, 360, 1440] as const;
export const MAX_INTENTOS = ESPERAS_MIN.length;

/**
 * Cuándo volver a intentar tras `intentos` fallidos (ya contado el actual).
 * `null` = no se reintenta más (queda el botón).
 */
export function proximoIntento(intentos: number, ahora: Date): Date | null {
  if (intentos < 1 || intentos > MAX_INTENTOS) return null;
  return new Date(ahora.getTime() + ESPERAS_MIN[intentos - 1]! * 60_000);
}

/** Los estados que la periódica vuelve a mirar. */
export const ESTADOS_REINTENTABLES: readonly EstadoDeTraida[] = ["pendiente", "no_lista", "error"];

/** Error del adaptador → estado de la traída (y si vale reintentar). */
export function estadoPorError(code: ZoomErrorCode | "interno"): {
  estado: EstadoDeTraida;
  reintentar: boolean;
} {
  switch (code) {
    case "no_terminada":
      return { estado: "no_lista", reintentar: true };
    case "sin_permiso":
      return { estado: "sin_permiso", reintentar: false };
    case "fuera_de_plazo":
      return { estado: "fuera_de_plazo", reintentar: false };
    case "credenciales_invalidas":
      return { estado: "error", reintentar: false };
    default:
      return { estado: "error", reintentar: true };
  }
}

/**
 * Zoom guarda el reporte de participantes ~12 meses (error 12702). Más atrás
 * ni se le pregunta: la clase queda "fuera de plazo" sin llamar a Zoom.
 */
export const DIAS_DE_REPORTE_EN_ZOOM = 365;

export function fueraDelPlazoDeZoom(finDeClase: Date, ahora: Date): boolean {
  return ahora.getTime() - finDeClase.getTime() > DIAS_DE_REPORTE_EN_ZOOM * 86_400_000;
}

/**
 * Lo que dice la pantalla de cada estado, en castellano y sin la respuesta
 * cruda de Zoom. `detalle` es el mensaje propio guardado (p. ej. los
 * permisos que faltan).
 */
export function mensajeDeEstado(input: {
  estado: EstadoDeTraida;
  proximo: Date | null;
  detalle: string | null;
  timeZone: string;
}): string {
  const hora = (d: Date) =>
    new Intl.DateTimeFormat("es-UY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: input.timeZone,
    }).format(d);
  switch (input.estado) {
    case "pendiente":
      return "Buscando la reunión en Zoom…";
    case "lista":
      return "Zoom informó quién se conectó. Revisá y confirmá.";
    case "sin_reunion":
      return input.detalle ?? "No hubo reunión de Zoom en esa aula en el horario de la clase.";
    case "ambigua":
      return "Hubo más de una reunión en el horario de la clase. Elegí cuál es.";
    case "no_lista":
      return input.proximo
        ? `Zoom todavía no tiene el reporte. Se vuelve a intentar a las ${hora(input.proximo)}.`
        : "Zoom todavía no tiene el reporte. Probá «Traer de Zoom» más tarde.";
    case "sin_permiso":
      return input.detalle ?? "La app de Zoom de esta cuenta no tiene permiso para leer reportes.";
    case "fuera_de_plazo":
      return input.detalle ?? "Zoom ya no guarda el reporte de esta clase (más de un año).";
    case "error":
      return input.proximo
        ? `No se pudo leer Zoom (${input.detalle ?? "error"}). Se vuelve a intentar a las ${hora(input.proximo)}.`
        : `No se pudo leer Zoom (${input.detalle ?? "error"}). Probá «Traer de Zoom» más tarde.`;
  }
}

export type ProgresoDeTraidas = {
  /** En cola o reintentando. */
  pendientes: number;
  /** Con sugerencia lista para revisar. */
  listas: number;
  /** Zoom no encontró la reunión, era ambigua o la clase es muy vieja. */
  noEncontradas: number;
  /** Sin permiso o error que no se reintenta. */
  conProblemas: number;
  confirmadas: number;
};

/** El avance de "clases pasadas" que muestra Configuración › Zoom. */
export function progresoDeTraidas(
  filas: readonly { status: EstadoDeTraida; confirmada: boolean; n: number }[]
): ProgresoDeTraidas {
  const p: ProgresoDeTraidas = { pendientes: 0, listas: 0, noEncontradas: 0, conProblemas: 0, confirmadas: 0 };
  for (const r of filas) {
    if (r.confirmada) p.confirmadas += r.n;
    else if (r.status === "pendiente" || r.status === "no_lista") p.pendientes += r.n;
    else if (r.status === "lista") p.listas += r.n;
    else if (r.status === "sin_reunion" || r.status === "ambigua" || r.status === "fuera_de_plazo") p.noEncontradas += r.n;
    else p.conProblemas += r.n;
  }
  return p;
}
