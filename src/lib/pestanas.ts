/**
 * 2026-10-26 — Las claves de `?tab=` de cada página con pestañas, en un solo
 * lugar: el servidor las valida con `leerPestana` y el cliente las escribe en
 * la URL. Son slugs en castellano que siguen a la etiqueta visible ("grupo",
 * no "cohorte"). Las claves internas viejas quedan como alias para que un
 * enlace que ya circula siga abriendo donde debe.
 *
 * Puro y sin "use client": un server component no puede leer constantes de un
 * módulo de cliente (recibiría una referencia, no el valor).
 */

import type { TipoDeContacto } from "@/lib/recorrido-comercial";

/* ------------------------------------------------------------ /academico */

export const PESTANAS_ACADEMICO = ["cursos", "grupos", "profesores", "aulas"] as const;
export type PestanaAcademico = (typeof PESTANAS_ACADEMICO)[number];
export const ALIAS_ACADEMICO: Readonly<Record<string, PestanaAcademico>> = {
  courses: "cursos",
  cohorts: "grupos",
  cohortes: "grupos",
  teachers: "profesores",
  rooms: "aulas",
};

/* ------------------------------------------------------- /cohorts/[id] */

export type PestanaDelGrupo =
  | "recorrido"
  | "alumnos"
  | "clases"
  | "asistencia"
  | "evaluacion"
  | "avisos"
  | "cursos-offline";
export const ALIAS_DEL_GRUPO: Readonly<Record<string, PestanaDelGrupo>> = {
  program: "recorrido",
  roster: "alumnos",
  classes: "clases",
  attendance: "asistencia",
  grading: "evaluacion",
  announcements: "avisos",
  offline: "cursos-offline",
};

/**
 * Las pestañas que ESTE grupo muestra, en orden. Recorrido solo en una
 * especialización (y es la primera y la default); Cursos offline solo con
 * `academico.ver` y nunca en un módulo. Lo que no está acá no se abre por URL.
 */
export function pestanasDelGrupo(opts: {
  esEspecializacion: boolean;
  verCursosOffline: boolean;
}): PestanaDelGrupo[] {
  return [
    ...(opts.esEspecializacion ? (["recorrido"] as const) : []),
    "alumnos",
    "clases",
    "asistencia",
    "evaluacion",
    "avisos",
    ...(opts.verCursosOffline ? (["cursos-offline"] as const) : []),
  ];
}

/* ------------------------------------------------------------ /contacts */

export const PESTANAS_CONTACTOS = ["todos", "leads", "alumnos-activos", "exalumnos"] as const;
export type PestanaContactos = (typeof PESTANAS_CONTACTOS)[number];

/** Las pestañas de contactos son el filtro `tipo` de `/api/contacts`. */
export type FiltroDeContactos = "todos" | TipoDeContacto;
export const FILTRO_POR_PESTANA_DE_CONTACTOS: Record<PestanaContactos, FiltroDeContactos> = {
  todos: "todos",
  leads: "lead",
  "alumnos-activos": "alumno_activo",
  exalumnos: "exalumno",
};
export const PESTANA_POR_FILTRO_DE_CONTACTOS: Record<FiltroDeContactos, PestanaContactos> = {
  todos: "todos",
  lead: "leads",
  alumno_activo: "alumnos-activos",
  exalumno: "exalumnos",
};

/* ----------------------------------------------- /finanzas, /facturacion */

export const PESTANAS_FINANZAS = ["caja", "devengado", "ventas"] as const;
export type PestanaFinanzas = (typeof PESTANAS_FINANZAS)[number];

export const PESTANAS_FACTURACION = ["pendientes", "facturadas"] as const;
export type PestanaFacturacion = (typeof PESTANAS_FACTURACION)[number];

/* ------------------------------------------------------------ /marketing */

export const PESTANAS_MARKETING = ["campanas", "audiencias", "recompra"] as const;
export type PestanaMarketing = (typeof PESTANAS_MARKETING)[number];

/* ---------------------------------------------------------------- portal */

/** `/portal/cohortes/[id]` — el grupo como lo ve el profesor. */
/** 0086 — `cierre`: el resultado final de cada alumno, que confirma el profesor. */
export const PESTANAS_PORTAL_GRUPO = ["clases", "evaluaciones", "entregas", "cierre", "material"] as const;
export type PestanaPortalGrupo = (typeof PESTANAS_PORTAL_GRUPO)[number];
export const ALIAS_PORTAL_GRUPO: Readonly<Record<string, PestanaPortalGrupo>> = {
  evaluacion: "evaluaciones",
};

/**
 * `/portal/cursadas/[id]` — la cursada del alumno. «Módulos» existe solo en
 * una especialización, y eso se sabe recién con los datos: el cliente decide
 * si la pedida está disponible.
 */
export const PESTANAS_PORTAL_CURSADA = [
  "modulos",
  "clases",
  "evaluaciones",
  "material",
  "avisos",
] as const;
export type PestanaPortalCursada = (typeof PESTANAS_PORTAL_CURSADA)[number];
