import type { LicenseSource } from "./license-source";

/**
 * 035 (US1/US2, FR-001..FR-010) — Licencias para todo el grupo de una cohorte.
 *
 * Reglas PURAS: qué filas de `license` crear, convertir, reactivar o liberar.
 * Las consultas viven en `src/server/group-licenses.ts`, que les da filas y
 * escribe lo que acá se decide (`tests/unit/licencias-grupales.test.ts`).
 *
 * Una licencia del grupo es una fila de `license` como cualquier otra —un
 * asiento de software por inscripción, que descuenta del stock— con
 * `source = 'grupo'`. Así el inventario, el portal y el roster la ven sin
 * saber nada del grupo.
 */

/** Una fila de `license` de UNA inscripción, con la ocupación ya derivada. */
export type LicenciaExistente = {
  id: string;
  softwareId: string;
  assigned: boolean;
  source: LicenseSource;
  /** `licenciaOcupada()` de hoy: asignada, sin vencer y de un curso no terminado. */
  ocupa: boolean;
};

export type PlanAlGrupo =
  | {
      ok: true;
      /** FR-010 — Filas que ya ocupan: pasan a ser del grupo sin descontar otra vez. */
      convertir: string[];
      /** Filas liberadas (o vencidas) del mismo programa: se reactivan, descuentan. */
      reactivar: string[];
      /** Inscripciones sin fila de este programa: se inserta una, descuenta. */
      insertar: string[];
      /** Cuántas licencias del stock consume el plan. */
      necesarias: number;
    }
  | { ok: false; faltan: number; necesarias: number; disponibles: number };

/**
 * FR-002 — Asignar un programa al grupo: TODO o NADA.
 *
 * Asignar a una parte del grupo crea justamente el desorden que la 035 quiere
 * evitar (¿quién la tiene y quién no?), así que sin stock para todos no se
 * asigna ninguna y se dice cuántas faltan.
 *
 * `descuentaStock` es falso cuando una licencia nueva de esta cohorte no
 * ocuparía lugar (el curso ya terminó o el vencimiento elegido ya pasó): ahí
 * no hay stock que pedir.
 */
export function planAsignarAlGrupo(input: {
  softwareId: string;
  miembros: readonly { enrollmentId: string; licencias: readonly LicenciaExistente[] }[];
  disponibles: number;
  descuentaStock: boolean;
}): PlanAlGrupo {
  const convertir: string[] = [];
  const reactivar: string[] = [];
  const insertar: string[] = [];
  for (const m of input.miembros) {
    const fila = m.licencias.find((l) => l.softwareId === input.softwareId);
    if (!fila) insertar.push(m.enrollmentId);
    else if (fila.assigned && fila.ocupa) convertir.push(fila.id);
    else reactivar.push(fila.id);
  }
  const necesarias = input.descuentaStock ? reactivar.length + insertar.length : 0;
  const disponibles = Math.max(0, input.disponibles);
  if (necesarias > disponibles) {
    return { ok: false, faltan: necesarias - disponibles, necesarias, disponibles };
  }
  return { ok: true, convertir, reactivar, insertar, necesarias };
}

/** El motivo del rechazo de FR-002, con los números. */
export function mensajeFaltanLicencias(
  programa: string,
  f: { faltan: number; necesarias: number; disponibles: number }
): string {
  const falta = f.faltan === 1 ? "Falta 1 licencia" : `Faltan ${f.faltan} licencias`;
  return `${falta} de ${programa}: el grupo necesita ${f.necesarias} y hay ${f.disponibles} libres. No se asignó ninguna.`;
}

/**
 * FR-005 — Quitar un programa del grupo libera las del GRUPO de ese
 * programa, vencidas incluidas. Las individuales no se tocan: no las dio el
 * grupo, no las quita el grupo.
 */
export function planQuitarDelGrupo<
  T extends Pick<LicenciaExistente, "id" | "softwareId" | "assigned" | "source">,
>(
  licencias: readonly T[],
  softwareId: string
): string[] {
  return licencias
    .filter((l) => l.softwareId === softwareId && l.source === "grupo" && l.assigned)
    .map((l) => l.id);
}

export type PlanDeSincronizacion = {
  /** Del grupo, de un programa que su cohorte ya no tiene en el grupo. */
  liberar: string[];
  convertir: { id: string; softwareId: string }[];
  reactivar: { id: string; softwareId: string }[];
  /** Programas para los que se inserta una fila nueva. */
  insertar: string[];
  /** FR-004 — Programas del grupo que no se pudieron dar por falta de stock. */
  sinStock: string[];
};

/**
 * FR-004/FR-006 — Lleva las licencias del grupo de UNA inscripción a lo que
 * dice su cohorte hoy. Lo usan las cuatro puertas que cambian quién está en
 * un grupo: el alta (normal y la automática de los módulos, 034), "Mudar" y
 * la baja (con `grupo` vacío, porque quien está de baja no es del grupo).
 *
 * A diferencia de asignar al grupo, esto NO es todo o nada: sin stock la
 * inscripción se guarda igual y el faltante queda a la vista (`sinStock`).
 * `disponibles` se va descontando: dos programas no se prometen el mismo
 * lugar.
 */
export function planSincronizarInscripcion(input: {
  grupo: readonly { softwareId: string; descuentaStock: boolean }[];
  licencias: readonly LicenciaExistente[];
  disponibles: ReadonlyMap<string, number>;
}): PlanDeSincronizacion {
  const delGrupo = new Set(input.grupo.map((g) => g.softwareId));
  const plan: PlanDeSincronizacion = {
    liberar: input.licencias
      .filter((l) => l.source === "grupo" && l.assigned && !delGrupo.has(l.softwareId))
      .map((l) => l.id),
    convertir: [],
    reactivar: [],
    insertar: [],
    sinStock: [],
  };
  const libres = new Map(input.disponibles);
  for (const g of input.grupo) {
    const fila = input.licencias.find((l) => l.softwareId === g.softwareId);
    if (fila?.assigned && fila.ocupa) {
      if (fila.source === "individual") plan.convertir.push({ id: fila.id, softwareId: g.softwareId });
      continue;
    }
    if (g.descuentaStock) {
      const quedan = libres.get(g.softwareId) ?? 0;
      if (quedan <= 0) {
        plan.sinStock.push(g.softwareId);
        continue;
      }
      libres.set(g.softwareId, quedan - 1);
    }
    if (fila) plan.reactivar.push({ id: fila.id, softwareId: g.softwareId });
    else plan.insertar.push(g.softwareId);
  }
  return plan;
}

/**
 * FR-008 — Con el programa en el grupo de la cohorte, asignarlo o quitarlo
 * por alumno queda prohibido en toda ruta. Una sola función para que las dos
 * puertas (asignar y liberar) no puedan responder distinto.
 */
export function licenciaDelGrupoBloquea(
  grupoSoftwareIds: readonly string[],
  softwareId: string
): boolean {
  return grupoSoftwareIds.includes(softwareId);
}

export const MENSAJE_LICENCIA_DEL_GRUPO = (programa: string) =>
  `${programa} está asignado al grupo: se asigna y se quita desde el grupo, no por alumno.`;
