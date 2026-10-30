/**
 * 2026-10-30 — Los filtros de la pantalla Grabaciones, sin pantalla ni base.
 *
 * La lista se pagina en el servidor (puede haber miles), así que filtrar lo
 * hace la consulta; acá vive lo que la pantalla necesita decidir sola: qué
 * estados se ofrecen y en qué orden, cuántas grabaciones caen en cada uno
 * (a partir de un `group by` del servidor) y qué etiquetas muestra el resumen.
 *
 * Los filtros siguen en la URL con los MISMOS nombres de siempre
 * (`?state=ambigua` lo enlaza Tareas de Hoy).
 */

/** Los estados por los que se filtra, en el orden en que se ofrecen. */
export const ESTADOS_DE_GRABACION = [
  "pendiente",
  "asignada",
  "ambigua",
  "conflicto",
  "sin_clase",
  "faltante",
] as const;

export type EstadoDeGrabacion = (typeof ESTADOS_DE_GRABACION)[number];

export const ETIQUETA_DE_ESTADO: Record<EstadoDeGrabacion, string> = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  ambigua: "Ambigua",
  conflicto: "En conflicto",
  sin_clase: "Sin clase",
  faltante: "Ya no está en Zoom",
};

export function esEstadoDeGrabacion(v: string): v is EstadoDeGrabacion {
  return (ESTADOS_DE_GRABACION as readonly string[]).includes(v);
}

/** Cuántas grabaciones hay en cada estado, con los OTROS filtros puestos. */
export type ConteoPorEstado = { todas: number } & Record<EstadoDeGrabacion, number>;

/**
 * Una fila del `group by assignment_state` del servidor: cuántas hay en ese
 * estado y cuántas de ellas ya no están en Zoom ("faltante" no es un estado
 * de adjudicación: es una marca que cruza a todos).
 */
export type GrupoPorEstado = { state: string; cantidad: number; faltantes: number };

export function contarPorEstado(grupos: readonly GrupoPorEstado[]): ConteoPorEstado {
  const conteo: ConteoPorEstado = {
    todas: 0,
    pendiente: 0,
    asignada: 0,
    ambigua: 0,
    conflicto: 0,
    sin_clase: 0,
    faltante: 0,
  };
  for (const g of grupos) {
    conteo.todas += g.cantidad;
    conteo.faltante += g.faltantes;
    if (g.state !== "faltante" && esEstadoDeGrabacion(g.state)) conteo[g.state] += g.cantidad;
  }
  return conteo;
}

/** Lo que la URL dice de los filtros (vacío = sin filtro). */
export type FiltrosDeGrabaciones = {
  connectionId: string;
  roomId: string;
  from: string;
  to: string;
  state: string;
};

export const SIN_FILTROS_DE_GRABACIONES: FiltrosDeGrabaciones = {
  connectionId: "",
  roomId: "",
  from: "",
  to: "",
  state: "",
};

/** "2026-10-03" → "3/10/2026". Lo que no es una fecha se devuelve igual. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : iso;
}

export type EtiquetaDeFiltro = { clave: keyof FiltrosDeGrabaciones | "fechas"; etiqueta: string };

/**
 * Las etiquetas quitables del resumen, en el orden de la tarjeta. Las fechas
 * van juntas en una sola ("Desde 1/10/2026 hasta 7/10/2026"): se quitan
 * juntas. Un id que ya no está en las listas se nombra como "otra cuenta" /
 * "otra aula" en vez de mostrar el id.
 */
export function etiquetasDeFiltros(
  f: FiltrosDeGrabaciones,
  nombres: { cuentas: ReadonlyMap<string, string>; aulas: ReadonlyMap<string, string> }
): EtiquetaDeFiltro[] {
  const etiquetas: EtiquetaDeFiltro[] = [];
  if (f.connectionId) {
    etiquetas.push({
      clave: "connectionId",
      etiqueta: `Cuenta: ${nombres.cuentas.get(f.connectionId) ?? "otra cuenta"}`,
    });
  }
  if (f.roomId) {
    etiquetas.push({ clave: "roomId", etiqueta: `Aula: ${nombres.aulas.get(f.roomId) ?? "otra aula"}` });
  }
  if (f.from || f.to) {
    const partes = [
      f.from ? `Desde ${fechaCorta(f.from)}` : null,
      f.to ? `${f.from ? "hasta" : "Hasta"} ${fechaCorta(f.to)}` : null,
    ].filter(Boolean);
    etiquetas.push({ clave: "fechas", etiqueta: partes.join(" ") });
  }
  if (f.state) {
    etiquetas.push({
      clave: "state",
      etiqueta: `Estado: ${esEstadoDeGrabacion(f.state) ? ETIQUETA_DE_ESTADO[f.state] : f.state}`,
    });
  }
  return etiquetas;
}
