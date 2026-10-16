import { licenciaOcupada } from "./license-rules";
import type { LicenseSource } from "./license-source";

/**
 * 035 (US3, FR-013..FR-016) — La vista de Licencias: quién tiene cada
 * programa, sin abrir ninguna cohorte.
 *
 * Pura. Los contadores salen de `licenciaOcupada`, la MISMA regla con la que
 * `contarOcupadas` arma el stock del inventario y del home: si la vista
 * contara `assigned = true`, diría un número distinto del que bloquea una
 * asignación (SC-003).
 *
 * Sin teléfono, correo ni nada de plata: la vista se abre con
 * `academico.ver` y lo que ese permiso no debe ver no viaja.
 */

export type EstadoDeLicencia = "en_uso" | "vencida" | "curso_terminado";

export type FilaDeLicenciaVista = {
  licenseId: string;
  enrollmentId: string;
  softwareId: string;
  contactId: string;
  contactName: string;
  cohortId: string | null;
  cohortName: string | null;
  source: LicenseSource;
  assignedAt: string | null;
  expiresAt: string | null;
  estado: EstadoDeLicencia;
};

/** FR-016 — Alguien del grupo que debería tener el programa y no lo tiene. */
export type FaltanteDelGrupo = {
  softwareId: string;
  enrollmentId: string;
  contactId: string;
  contactName: string;
  cohortId: string;
  cohortName: string;
};

export type ProgramaDeLaVista = {
  softwareId: string;
  name: string;
  total: number;
  /** Si tiene foto en `/api/software/:id/photo`. */
  hasPhoto: boolean;
  /** Las que OCUPAN hoy (= el stock). */
  asignadas: number;
  libres: number;
  filas: FilaDeLicenciaVista[];
  faltantes: FaltanteDelGrupo[];
};

/** Por qué una licencia asignada ocupa o no ocupa un lugar del stock. */
export function estadoDeLicencia(
  licencia: { expiresAt: Date | null },
  cohorte: { startDate: Date | null; endDate: Date | null } | null,
  now: Date = new Date()
): EstadoDeLicencia {
  if (licenciaOcupada({ assigned: true, expiresAt: licencia.expiresAt }, cohorte, now)) {
    return "en_uso";
  }
  return licencia.expiresAt && licencia.expiresAt <= now ? "vencida" : "curso_terminado";
}

export function armarVistaDeLicencias(
  software: readonly { id: string; name: string; total: number; hasPhoto?: boolean }[],
  filas: readonly FilaDeLicenciaVista[],
  faltantes: readonly FaltanteDelGrupo[]
): ProgramaDeLaVista[] {
  return software.map((s) => {
    const suyas = filas.filter((f) => f.softwareId === s.id);
    const asignadas = suyas.filter((f) => f.estado === "en_uso").length;
    return {
      softwareId: s.id,
      name: s.name,
      total: s.total,
      hasPhoto: s.hasPhoto ?? false,
      asignadas,
      libres: s.total - asignadas,
      filas: suyas,
      faltantes: faltantes.filter((f) => f.softwareId === s.id),
    };
  });
}

/**
 * FR-004/FR-016 — Los miembros de un grupo con el programa asignado al grupo
 * que no tienen esa licencia asignada (se inscribieron sin stock).
 */
export function faltantesDelGrupo(
  grupos: readonly { cohortId: string; softwareId: string }[],
  miembros: readonly {
    enrollmentId: string;
    cohortId: string;
    contactId: string;
    contactName: string;
    cohortName: string;
  }[],
  asignadas: readonly { enrollmentId: string; softwareId: string }[]
): FaltanteDelGrupo[] {
  const tiene = new Set(asignadas.map((a) => `${a.enrollmentId}\u0000${a.softwareId}`));
  const salida: FaltanteDelGrupo[] = [];
  for (const g of grupos) {
    for (const m of miembros) {
      if (m.cohortId !== g.cohortId) continue;
      if (tiene.has(`${m.enrollmentId}\u0000${g.softwareId}`)) continue;
      salida.push({ softwareId: g.softwareId, ...m });
    }
  }
  return salida;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** FR-014 — Filtro por cohorte y origen, búsqueda por alumno. */
export function filtrarFilas<T extends Pick<FilaDeLicenciaVista, "cohortId" | "source" | "contactName">>(
  filas: readonly T[],
  filtro: { cohortId?: string | null; source?: LicenseSource | null; q?: string }
): T[] {
  const q = filtro.q ? normalizar(filtro.q) : "";
  return filas.filter(
    (f) =>
      (!filtro.cohortId || f.cohortId === filtro.cohortId) &&
      (!filtro.source || f.source === filtro.source) &&
      (!q || normalizar(f.contactName).includes(q))
  );
}
