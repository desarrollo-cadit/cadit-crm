import { coincideConBusqueda } from "./contact-search";
import { claveDeStock } from "./license-team";
import { licenciaDeProfesorOcupada, licenciaOcupada } from "./license-rules";
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
 * `academico.ver` y lo que ese permiso no debe ver no viaja. La única
 * excepción es el correo de la LICENCIA (2026-10-21), y solo con
 * `contactos.ver`: quien ya ve el correo del alumno.
 *
 * 0087 — El stock es por equipo de licencias: cada programa lleva su cupo,
 * asignadas y libres POR EQUIPO (`porEquipo`), y cada fila dice de qué equipo
 * sale. El total del programa es la suma de los equipos activos.
 */

export type EstadoDeLicencia = "en_uso" | "vencida" | "curso_terminado";

/** 0088 — Quién tiene la licencia: un alumno (inscripción) o un profesor. */
export type TitularDeLicencia = "alumno" | "profesor";

export type FilaDeLicenciaVista = {
  licenseId: string;
  /** `null` en la de un profesor, que no tiene inscripción. */
  enrollmentId: string | null;
  /** 0088 — Solo en la de un profesor. */
  teacherId: string | null;
  titular: TitularDeLicencia;
  softwareId: string;
  /** 0087 — El equipo del que sale el asiento. */
  teamId: string;
  /** `null` en la de un profesor (no es un contacto). */
  contactId: string | null;
  /** El nombre del alumno o del profesor. */
  contactName: string;
  cohortId: string | null;
  cohortName: string | null;
  source: LicenseSource;
  assignedAt: string | null;
  expiresAt: string | null;
  estado: EstadoDeLicencia;
  /**
   * 2026-10-21 — El correo de la licencia (`correoDeLicencia`). Solo viaja
   * si la sesión ve correos de contactos (`contactos.ver`); sin ella, la
   * propiedad no existe.
   */
  licenseEmail?: { email: string | null; distinto: boolean };
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

/** 0087 — El cupo de un programa en un equipo, con lo que ocupa hoy. */
export type CupoPorEquipoVista = {
  teamId: string;
  total: number;
  asignadas: number;
  /** 0089 — Ocupados en Autodesk sin titular en el campus (restan de lo libre). */
  externos: number;
  libres: number;
};

export type ProgramaDeLaVista = {
  softwareId: string;
  name: string;
  /** La suma del cupo de los equipos activos. */
  total: number;
  /** Si tiene foto en `/api/software/:id/photo`. */
  hasPhoto: boolean;
  /** Las que OCUPAN hoy (= el stock). */
  asignadas: number;
  /** 0089 — La suma de los asientos ajenos de todos los equipos. */
  externos: number;
  libres: number;
  /** 0087 — El mismo conteo, equipo por equipo. */
  porEquipo: CupoPorEquipoVista[];
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

/**
 * 0088 — El estado de la licencia de un profesor: no tiene cohorte, así que
 * no puede estar "curso terminado"; o está en uso o venció.
 */
export function estadoDeLicenciaDeProfesor(
  licencia: { expiresAt: Date | null },
  now: Date = new Date()
): EstadoDeLicencia {
  return licenciaDeProfesorOcupada({ assigned: true, expiresAt: licencia.expiresAt }, now)
    ? "en_uso"
    : "vencida";
}

export function armarVistaDeLicencias(
  software: readonly { id: string; name: string; total: number; hasPhoto?: boolean }[],
  filas: readonly FilaDeLicenciaVista[],
  faltantes: readonly FaltanteDelGrupo[],
  /** 0087 — El cupo de cada equipo en cada programa. */
  cupos: readonly { teamId: string; softwareId: string; total: number }[] = [],
  /** 0089 — Asientos ajenos por `claveDeStock(equipo, programa)`. */
  ajenos: ReadonlyMap<string, number> = new Map()
): ProgramaDeLaVista[] {
  return software.map((s) => {
    const suyas = filas.filter((f) => f.softwareId === s.id);
    const asignadas = suyas.filter((f) => f.estado === "en_uso").length;
    const porEquipo = cupos
      .filter((c) => c.softwareId === s.id)
      .map((c) => {
        const delEquipo = suyas.filter((f) => f.teamId === c.teamId && f.estado === "en_uso").length;
        const externos = ajenos.get(claveDeStock(c.teamId, c.softwareId)) ?? 0;
        return {
          teamId: c.teamId,
          total: c.total,
          asignadas: delEquipo,
          externos,
          libres: c.total - delEquipo - externos,
        };
      });
    const externos = porEquipo.reduce((suma, c) => suma + c.externos, 0);
    return {
      softwareId: s.id,
      name: s.name,
      total: s.total,
      hasPhoto: s.hasPhoto ?? false,
      asignadas,
      externos,
      libres: s.total - asignadas - externos,
      porEquipo,
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
  asignadas: readonly { enrollmentId: string | null; softwareId: string }[]
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

/**
 * FR-014 — Filtro por cohorte y origen, búsqueda por alumno. La búsqueda es
 * la regla única de `src/lib/contact-search.ts` (2026-10-26): cada palabra en
 * el nombre, en cualquier orden, sin tildes ni mayúsculas.
 */
export function filtrarFilas<
  T extends Pick<FilaDeLicenciaVista, "cohortId" | "source" | "contactName"> & {
    teamId?: string;
    titular?: TitularDeLicencia;
  },
>(
  filas: readonly T[],
  filtro: {
    cohortId?: string | null;
    source?: LicenseSource | null;
    teamId?: string | null;
    /** 0088 — Alumnos o profesores. */
    titular?: TitularDeLicencia | null;
    q?: string;
  }
): T[] {
  const q = filtro.q ?? "";
  return filas.filter(
    (f) =>
      (!filtro.cohortId || f.cohortId === filtro.cohortId) &&
      (!filtro.source || f.source === filtro.source) &&
      (!filtro.teamId || f.teamId === filtro.teamId) &&
      (!filtro.titular || (f.titular ?? "alumno") === filtro.titular) &&
      coincideConBusqueda(q, { texto: [f.contactName] })
  );
}
