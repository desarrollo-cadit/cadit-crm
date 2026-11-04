import { computeCohortStatus } from "@/lib/cohort-status";
import { claveDeStock } from "@/lib/license-team";

/**
 * 0091 — Conciliar lo que dice Autodesk con lo que dice el campus.
 *
 * Reglas PURAS. El mismo `planDeConciliacion` arma la vista previa de un
 * archivo (con sus filas en memoria) y el reporte de trabajo (con las filas de
 * la última importación del equipo): no hay dos cuentas que puedan diferir.
 * Nada acá lee la base; las consultas viven en `src/server/autodesk-import.ts`.
 *
 * Vocabulario: un CASO es una (persona, programa) de UN equipo en la que
 * Autodesk y el campus no dicen lo mismo, o en la que dicen lo mismo y queda
 * verificada. La unidad de Autodesk es (correo, oferta ya mapeada a programa).
 */

/* ============================================================
 * Personas
 * ============================================================ */

export type RefDePersona =
  | { tipo: "alumno"; contactId: string }
  | { tipo: "profesor"; teacherId: string };

export function claveDePersona(p: RefDePersona): string {
  return p.tipo === "alumno" ? `c:${p.contactId}` : `t:${p.teacherId}`;
}

export type PersonaDelDirectorio = {
  ref: RefDePersona;
  nombre: string;
  /** Con lo que se la reconoce (minúsculas): correo del contacto, de sus licencias, del profesor. */
  correos: string[];
  /** Correo secundario: solo SUGIERE una vinculación, jamás reconoce solo. */
  secundarios?: string[];
  /** Dado de baja / archivado. */
  archivada: boolean;
};

export type AliasDeCorreo = { email: string; ref: RefDePersona };

/** El estado del curso de una inscripción; «sin_fechas» NO es terminado (regla de `licenciaOcupada`). */
export type EstadoDelCurso = "planificada" | "en_curso" | "finalizada" | "sin_fechas";

/**
 * Mismo criterio que `licenciaOcupada`: sin cohorte o sin fechas NO prueba que el
 * curso terminó. Con inicio, manda `computeCohortStatus`; con solo fin, terminó
 * cuando ya pasó.
 */
export function estadoDelCurso(
  cohorte: { startDate: Date | null; endDate: Date | null } | null,
  ahora: Date = new Date()
): EstadoDelCurso {
  if (!cohorte || (!cohorte.startDate && !cohorte.endDate)) return "sin_fechas";
  if (cohorte.startDate) return computeCohortStatus(cohorte.startDate, cohorte.endDate, ahora);
  return cohorte.endDate && ahora > cohorte.endDate ? "finalizada" : "sin_fechas";
}

export type LicenciaDeTitular = {
  licenseId: string;
  softwareId: string;
  teamId: string;
  source: "grupo" | "individual";
  /** Ocupa un asiento hoy (`licenciaOcupada`): no terminada ni vencida. */
  ocupa: boolean;
};

/** Quien puede tener licencias: una inscripción de un alumno, o un profesor. */
export type TitularDeLicencias = {
  ref: RefDePersona;
  enrollmentId: string | null;
  grupo: string | null;
  /**
   * `false` en un interesado: una inscripción sin grupo (pipeline) no es un curso
   * donde marcar una licencia. Ausente = `true` (compatibilidad).
   */
  conGrupo?: boolean;
  /** `null` en un profesor. */
  curso: EstadoDelCurso | null;
  /** Programas asignados a TODO el grupo de su cohorte (no se asignan por alumno). */
  programasDelGrupo: string[];
  licenciaPropia: boolean;
  /** El correo de la licencia de esta inscripción (o del profesor). */
  correo: string | null;
  /** Las licencias ASIGNADAS (`assigned = true`), de cualquier equipo. */
  licencias: LicenciaDeTitular[];
};

/* ============================================================
 * Entradas y casos
 * ============================================================ */

export type FilaDeAutodesk = {
  email: string;
  softwareId: string;
  nombre: string;
  offeringName: string;
};

export type DecisionGuardada = "mantener" | "omitir";

export type ResolucionGuardada = {
  teamId: string;
  softwareId: string;
  subject: string;
  decision: DecisionGuardada;
  nota: string | null;
  huella: string;
  resueltoPor: string | null;
  resueltoEn: string;
};

export type TipoDeTarea = "asignar_en_autodesk" | "sacar_en_autodesk";

export type TareaAbierta = {
  id: string;
  teamId: string;
  softwareId: string;
  kind: TipoDeTarea;
  email: string | null;
  ref: RefDePersona | null;
  /** Nombre de la persona, para mostrarla cuando no hay a quién enlazar. */
  persona: string | null;
  creadaEn: string;
};

export type EntradaDeConciliacion = {
  teamId: string;
  autodesk: readonly FilaDeAutodesk[];
  directorio: readonly PersonaDelDirectorio[];
  alias: readonly AliasDeCorreo[];
  titulares: readonly TitularDeLicencias[];
  /** Las filas de Autodesk de OTROS equipos (su última importación). */
  otrosEquipos?: readonly { email: string; softwareId: string; teamId: string }[];
  resoluciones?: readonly ResolucionGuardada[];
  tareas?: readonly TareaAbierta[];
  /** Cuántas importaciones guardadas traen (correo, programa), y desde cuándo. */
  apariciones?: ReadonlyMap<string, { n: number; de: number; desde: string }>;
};

export type TipoDeCaso =
  /** Autodesk y el campus dicen lo mismo. */
  | "coincide"
  /** Autodesk sí, campus no, y la persona existe en el campus. */
  | "falta_en_campus"
  /** Autodesk sí y no hay nadie en el campus con ese correo. */
  | "externo"
  /** Campus sí, Autodesk no. */
  | "falta_en_autodesk"
  /** Autodesk sí y el campus la tiene anotada en OTRO equipo. */
  | "en_otro_equipo"
  /** Autodesk sí, pero el campus ya la considera libre (curso terminado o vencida). */
  | "curso_terminado";

export type AccionDeCaso =
  | "asignar"
  | "desmarcar"
  | "mover"
  | "pendiente_en_autodesk"
  | "sacar_en_autodesk"
  | "mantener"
  | "omitir"
  | "vincular";

export type CandidataDeAsignacion = {
  enrollmentId: string;
  grupo: string;
  curso: EstadoDelCurso;
  /** Por qué NO se puede asignar a esta inscripción, o `null` si se puede. */
  bloqueo: "grupo" | "licencia_propia" | null;
};

export type EstadoDelCaso = "verificado" | "a_resolver" | "resuelto" | "pendiente";

export type CasoDeConciliacion = {
  /** Estable entre vista previa y reporte: `<programa>|<correo o persona>`. */
  clave: string;
  tipo: TipoDeCaso;
  teamId: string;
  softwareId: string;
  email: string | null;
  nombre: string;
  persona: RefDePersona | null;
  personaArchivada: boolean;
  /** Una persona que se parece (correo secundario): se ofrece vincular, nunca se vincula sola. */
  sugerencia: { ref: RefDePersona; nombre: string } | null;
  acciones: AccionDeCaso[];
  sugerida: AccionDeCaso | null;
  /** Entra en «Aplicar lo seguro». */
  seguro: boolean;
  candidatas: CandidataDeAsignacion[];
  preseleccionada: string | null;
  licenseId: string | null;
  enrollmentId: string | null;
  destinoTeamId: string | null;
  grupo: string | null;
  nota: string | null;
  huella: string;
  estado: EstadoDelCaso;
  resolucion: { decision: DecisionGuardada; nota: string | null; resueltoPor: string | null; resueltoEn: string } | null;
  tarea: { id: string; kind: TipoDeTarea } | null;
  /** Externos: desde cuándo aparece y en cuántas importaciones. */
  aparece: { n: number; de: number; desde: string } | null;
};

/* ============================================================
 * Llaves
 * ============================================================ */

/** A quién se refiere un caso (o una resolución, o una tarea): el correo de Autodesk o la persona. */
export function subjectDeCorreo(email: string): string {
  return `e:${email}`;
}
export function subjectDePersona(ref: RefDePersona): string {
  return `p:${claveDePersona(ref)}`;
}

export function subjectDelCaso(c: Pick<CasoDeConciliacion, "tipo" | "email" | "persona">): string {
  if (c.tipo === "falta_en_autodesk") {
    return c.email ? subjectDeCorreo(c.email) : c.persona ? subjectDePersona(c.persona) : "p:?";
  }
  return subjectDeCorreo(c.email ?? "");
}

export function subjectDeTarea(t: Pick<TareaAbierta, "email" | "ref">): string {
  return t.email ? subjectDeCorreo(t.email) : t.ref ? subjectDePersona(t.ref) : "p:?";
}

export function claveDeCaso(softwareId: string, subject: string): string {
  return `${softwareId}|${subject}`;
}

/* ============================================================
 * El plan
 * ============================================================ */

export type PlanDeConciliacion = { teamId: string; casos: CasoDeConciliacion[] };

const ORDEN_DE_TIPO: Record<TipoDeCaso, number> = {
  falta_en_campus: 0,
  en_otro_equipo: 1,
  curso_terminado: 2,
  falta_en_autodesk: 3,
  externo: 4,
  coincide: 5,
};

const sinFinalizar = (c: EstadoDelCurso | null) => c !== "finalizada";

export function planDeConciliacion(e: EntradaDeConciliacion): PlanDeConciliacion {
  // --- Quién es cada correo --------------------------------------------------
  const porAlias = new Map(e.alias.map((a) => [a.email, a.ref] as const));
  const porCorreo = new Map<string, PersonaDelDirectorio[]>();
  const porSecundario = new Map<string, PersonaDelDirectorio[]>();
  const empujar = (m: Map<string, PersonaDelDirectorio[]>, k: string, p: PersonaDelDirectorio) => {
    const lista = m.get(k) ?? [];
    if (!lista.some((x) => claveDePersona(x.ref) === claveDePersona(p.ref))) lista.push(p);
    m.set(k, lista);
  };
  const delDirectorio = new Map(e.directorio.map((p) => [claveDePersona(p.ref), p] as const));
  for (const p of e.directorio) {
    for (const c of p.correos) empujar(porCorreo, c, p);
    for (const c of p.secundarios ?? []) empujar(porSecundario, c, p);
  }

  const personaDe = (email: string): { persona: PersonaDelDirectorio | null; ambigua: boolean } => {
    const vinculada = porAlias.get(email);
    if (vinculada) return { persona: delDirectorio.get(claveDePersona(vinculada)) ?? null, ambigua: false };
    const candidatas = porCorreo.get(email) ?? [];
    if (candidatas.length === 1) return { persona: candidatas[0]!, ambigua: false };
    return { persona: null, ambigua: candidatas.length > 1 };
  };

  // --- Qué tiene el campus ---------------------------------------------------
  const titularesDe = new Map<string, TitularDeLicencias[]>();
  for (const t of e.titulares) {
    const k = claveDePersona(t.ref);
    titularesDe.set(k, [...(titularesDe.get(k) ?? []), t]);
  }
  type Tenencia = { titular: TitularDeLicencias; licencia: LicenciaDeTitular };
  const tenenciasDe = (ref: RefDePersona, softwareId: string): Tenencia[] =>
    (titularesDe.get(claveDePersona(ref)) ?? []).flatMap((titular) =>
      titular.licencias.filter((l) => l.softwareId === softwareId).map((licencia) => ({ titular, licencia }))
    );

  const casos: CasoDeConciliacion[] = [];
  const autodeskDelEquipo = new Set<string>(); // `${personaKey}|${softwareId}` ya vistos en Autodesk
  const otrosEquipos = new Map<string, string>(); // `${personaKey}|${softwareId}` → teamId
  for (const o of e.otrosEquipos ?? []) {
    const { persona } = personaDe(o.email);
    if (persona) otrosEquipos.set(`${claveDePersona(persona.ref)}|${o.softwareId}`, o.teamId);
  }

  const base = (
    tipo: TipoDeCaso,
    softwareId: string,
    email: string | null,
    nombre: string,
    persona: PersonaDelDirectorio | null
  ): CasoDeConciliacion => ({
    clave: "",
    tipo,
    teamId: e.teamId,
    softwareId,
    email,
    nombre,
    persona: persona?.ref ?? null,
    personaArchivada: persona?.archivada ?? false,
    sugerencia: null,
    acciones: [],
    sugerida: null,
    seguro: false,
    candidatas: [],
    preseleccionada: null,
    licenseId: null,
    enrollmentId: null,
    destinoTeamId: null,
    grupo: null,
    nota: null,
    huella: tipo,
    estado: "a_resolver",
    resolucion: null,
    tarea: null,
    aparece: null,
  });

  // --- Autodesk → campus ------------------------------------------------------
  for (const f of e.autodesk) {
    const { persona, ambigua } = personaDe(f.email);

    if (!persona) {
      const c = base("externo", f.softwareId, f.email, f.nombre || f.email, null);
      c.acciones = ["mantener", "vincular", "sacar_en_autodesk"];
      c.sugerida = null;
      c.aparece = e.apariciones?.get(`${f.email}|${f.softwareId}`) ?? null;
      if (ambigua) c.nota = "Hay más de una persona con ese correo en el campus: vinculala a mano.";
      const parecida = (porSecundario.get(f.email) ?? [])[0];
      if (parecida) {
        c.sugerencia = { ref: parecida.ref, nombre: parecida.nombre };
        c.nota = `Es el correo secundario de ${parecida.nombre}: confirmá si es la misma persona.`;
      }
      casos.push(c);
      continue;
    }

    const pk = claveDePersona(persona.ref);
    autodeskDelEquipo.add(`${pk}|${f.softwareId}`);
    const tenencias = tenenciasDe(persona.ref, f.softwareId);
    const enEsteEquipo = tenencias.find((t) => t.licencia.teamId === e.teamId);

    if (enEsteEquipo) {
      const c = base(enEsteEquipo.licencia.ocupa ? "coincide" : "curso_terminado", f.softwareId, f.email, persona.nombre, persona);
      c.licenseId = enEsteEquipo.licencia.licenseId;
      c.enrollmentId = enEsteEquipo.titular.enrollmentId;
      c.grupo = enEsteEquipo.titular.grupo;
      if (c.tipo === "curso_terminado") {
        c.acciones = ["sacar_en_autodesk", "omitir"];
        c.sugerida = "sacar_en_autodesk";
        c.nota =
          enEsteEquipo.titular.curso === "finalizada"
            ? "El curso terminó: no debería seguir con la licencia en Autodesk."
            : "La licencia venció en el campus y sigue en Autodesk.";
        c.huella = `term:${c.licenseId}`;
      } else {
        c.huella = `coincide:${c.licenseId}`;
      }
      casos.push(c);
      continue;
    }

    const enOtro = tenencias.find((t) => t.licencia.teamId !== e.teamId);
    if (enOtro) {
      const c = base("en_otro_equipo", f.softwareId, f.email, persona.nombre, persona);
      c.licenseId = enOtro.licencia.licenseId;
      c.enrollmentId = enOtro.titular.enrollmentId;
      c.grupo = enOtro.titular.grupo;
      c.destinoTeamId = e.teamId;
      c.huella = `otro:${c.licenseId}:${enOtro.licencia.teamId}`;
      if (enOtro.licencia.source === "grupo") {
        c.acciones = ["omitir"];
        c.nota = "El campus la tiene en otro equipo por el grupo: cambiá el equipo del programa del grupo.";
      } else {
        c.acciones = ["mover", "omitir"];
        c.sugerida = "mover";
        c.seguro = !persona.archivada;
        c.nota = "El campus la tiene anotada en otro equipo: se pasa a este.";
      }
      casos.push(c);
      continue;
    }

    // Autodesk sí, el campus no la tiene en ningún equipo.
    const c = base("falta_en_campus", f.softwareId, f.email, persona.nombre, persona);
    c.personaArchivada = persona.archivada;
    if (persona.ref.tipo === "profesor") {
      c.acciones = ["asignar", "sacar_en_autodesk", "omitir"];
      c.sugerida = "asignar";
      c.seguro = true;
      c.huella = "falta:profesor";
    } else {
      const delAlumno = titularesDe.get(pk) ?? [];
      const candidatas: CandidataDeAsignacion[] = delAlumno
        .filter((t) => t.enrollmentId !== null && t.conGrupo !== false)
        .map((t) => ({
          enrollmentId: t.enrollmentId!,
          grupo: t.grupo ?? "Sin grupo",
          curso: t.curso ?? "sin_fechas",
          bloqueo: t.programasDelGrupo.includes(f.softwareId)
            ? ("grupo" as const)
            : t.licenciaPropia
              ? ("licencia_propia" as const)
              : null,
        }));
      c.candidatas = candidatas;
      const activas = candidatas.filter((k) => sinFinalizar(k.curso) && k.bloqueo === null);
      c.huella = `falta:${persona.archivada ? "baja" : "alta"}:${candidatas.map((k) => `${k.enrollmentId}${k.curso === "finalizada" ? "f" : ""}${k.bloqueo ?? ""}`).sort().join(",")}`;
      if (persona.archivada) {
        c.acciones = ["sacar_en_autodesk", "omitir"];
        c.sugerida = "sacar_en_autodesk";
        c.nota = "La persona está dada de baja en el campus.";
      } else if (activas.length === 0) {
        const delGrupo = candidatas.some((k) => sinFinalizar(k.curso) && k.bloqueo === "grupo");
        c.acciones = ["sacar_en_autodesk", "omitir"];
        c.sugerida = delGrupo ? null : "sacar_en_autodesk";
        c.nota = delGrupo
          ? "El programa es del grupo: asignalo desde el grupo."
          : candidatas.length === 0
            ? "No cursa nada en el campus: no debería tener la licencia."
            : "No tiene ningún curso en marcha: no debería tener la licencia.";
      } else {
        c.acciones = ["asignar", "sacar_en_autodesk", "omitir"];
        if (activas.length === 1) {
          c.sugerida = "asignar";
          c.preseleccionada = activas[0]!.enrollmentId;
          c.seguro = true;
        }
      }
    }
    casos.push(c);
  }

  // --- Campus → Autodesk (lo que el campus tiene y Autodesk no) -----------------
  for (const t of e.titulares) {
    for (const l of t.licencias) {
      if (l.teamId !== e.teamId) continue;
      const pk = claveDePersona(t.ref);
      if (autodeskDelEquipo.has(`${pk}|${l.softwareId}`)) continue;
      // Si Autodesk la tiene en OTRO equipo, el caso aparece allá («en otro equipo»).
      if (otrosEquipos.has(`${pk}|${l.softwareId}`)) continue;
      const persona = delDirectorio.get(pk) ?? null;
      const c = base("falta_en_autodesk", l.softwareId, t.correo, persona?.nombre ?? "Sin nombre", persona);
      c.persona = t.ref;
      c.licenseId = l.licenseId;
      c.enrollmentId = t.enrollmentId;
      c.grupo = t.grupo;
      c.huella = `faltaad:${l.licenseId}:${l.ocupa ? "ocupa" : "libre"}`;
      const terminada = !l.ocupa;
      if (l.source === "grupo") {
        c.acciones = terminada ? ["omitir"] : ["pendiente_en_autodesk", "omitir"];
        c.sugerida = terminada ? null : "pendiente_en_autodesk";
        c.nota = "Es del grupo: se quita desde el grupo, no por persona.";
      } else if (terminada) {
        c.acciones = ["desmarcar", "omitir"];
        c.sugerida = "desmarcar";
        c.seguro = true;
        c.nota = t.curso === "finalizada" ? "El curso terminó: no debería tener licencia." : "La licencia venció.";
      } else {
        c.acciones = ["pendiente_en_autodesk", "desmarcar", "omitir"];
        c.sugerida = "pendiente_en_autodesk";
        c.nota = "Falta asignársela en Autodesk.";
      }
      casos.push(c);
    }
  }

  // --- Claves, resoluciones, tareas ------------------------------------------------
  const resolucionesPor = new Map(
    (e.resoluciones ?? []).map((r) => [`${r.teamId}|${r.softwareId}|${r.subject}`, r] as const)
  );
  const tareasPor = new Map<string, TareaAbierta>();
  for (const t of e.tareas ?? []) {
    tareasPor.set(`${t.teamId}|${t.softwareId}|${subjectDeTarea(t)}`, t);
  }

  for (const c of casos) {
    const subject = subjectDelCaso(c);
    c.clave = claveDeCaso(c.softwareId, subject);
    if (c.tipo === "coincide") {
      c.estado = "verificado";
      continue;
    }
    const tarea = tareasPor.get(`${c.teamId}|${c.softwareId}|${subject}`);
    if (tarea) {
      c.tarea = { id: tarea.id, kind: tarea.kind };
      c.estado = "pendiente";
      continue;
    }
    const r = resolucionesPor.get(`${c.teamId}|${c.softwareId}|${subject}`);
    if (r && r.huella === c.huella) {
      c.resolucion = {
        decision: r.decision,
        nota: r.nota,
        resueltoPor: r.resueltoPor,
        resueltoEn: r.resueltoEn,
      };
      c.estado = "resuelto";
    }
  }

  casos.sort(
    (a, b) =>
      ORDEN_DE_TIPO[a.tipo] - ORDEN_DE_TIPO[b.tipo] ||
      a.nombre.localeCompare(b.nombre, "es") ||
      a.clave.localeCompare(b.clave)
  );
  return { teamId: e.teamId, casos };
}

/* ============================================================
 * Aplicar lo seguro
 * ============================================================ */

export type AccionSegura = {
  clave: string;
  accion: "asignar" | "desmarcar" | "mover";
  enrollmentId: string | null;
  caso: CasoDeConciliacion;
};

/**
 * Lo que se puede aplicar sin preguntar: SOLO lo que no tiene dos lecturas.
 * Asignar a quien tiene un único curso en marcha (o a un profesor), pasar de
 * equipo una licencia individual y desmarcar la que ya terminó. Lo ambiguo, lo
 * externo y lo pendiente en Autodesk lo decide una persona.
 */
export function accionesSeguras(plan: PlanDeConciliacion): AccionSegura[] {
  const salida: AccionSegura[] = [];
  for (const c of plan.casos) {
    if (c.estado !== "a_resolver" || !c.seguro || !c.sugerida) continue;
    if (c.sugerida !== "asignar" && c.sugerida !== "desmarcar" && c.sugerida !== "mover") continue;
    salida.push({
      clave: c.clave,
      accion: c.sugerida,
      enrollmentId: c.sugerida === "asignar" ? c.preseleccionada : c.enrollmentId,
      caso: c,
    });
  }
  return salida;
}

/* ============================================================
 * Cuentas por programa
 * ============================================================ */

export type ResumenDeAsientos = {
  softwareId: string;
  cupo: number;
  ocupadasAlumnos: number;
  ocupadasProfesores: number;
  enAutodesk: number;
  coinciden: number;
  /** En Autodesk y sin titular que ocupe asiento en el campus: lo que resta del disponible. */
  soloAutodesk: number;
  externos: number;
  /** Ocupan en el campus y Autodesk no las tiene. */
  soloCampus: number;
  descuadre: boolean;
};

export function resumenDeAsientos(
  plan: PlanDeConciliacion,
  cupos: ReadonlyMap<string, number>,
  ocupadas: ReadonlyMap<string, { alumnos: number; profesores: number }>,
  autodesk: readonly Pick<FilaDeAutodesk, "softwareId">[]
): ResumenDeAsientos[] {
  const programas = new Set<string>([
    ...cupos.keys(),
    ...ocupadas.keys(),
    ...autodesk.map((a) => a.softwareId),
  ]);
  return [...programas].map((softwareId) => {
    const enAutodesk = autodesk.filter((a) => a.softwareId === softwareId).length;
    const delPrograma = plan.casos.filter((c) => c.softwareId === softwareId);
    const coinciden = delPrograma.filter((c) => c.tipo === "coincide").length;
    const o = ocupadas.get(softwareId) ?? { alumnos: 0, profesores: 0 };
    const soloAutodesk = enAutodesk - coinciden;
    const soloCampus = o.alumnos + o.profesores - coinciden;
    return {
      softwareId,
      cupo: cupos.get(softwareId) ?? 0,
      ocupadasAlumnos: o.alumnos,
      ocupadasProfesores: o.profesores,
      enAutodesk,
      coinciden,
      soloAutodesk,
      externos: delPrograma.filter((c) => c.tipo === "externo").length,
      soloCampus,
      descuadre: soloAutodesk !== 0 || soloCampus !== 0,
    };
  });
}

/* ============================================================
 * Asientos de Autodesk que el campus no cuenta (disponibilidad)
 * ============================================================ */

export type TitularParaAjenos = {
  teamId: string;
  softwareId: string;
  /** La licencia OCUPA hoy (no terminada ni vencida). */
  ocupa: boolean;
  ref: RefDePersona;
  /** Sus correos de licencia/contacto/profesor, en minúsculas. */
  correos: readonly string[];
};

/**
 * Cuántos asientos de cada (equipo, programa) tiene Autodesk ocupados SIN que
 * el campus los cuente: la fila de Autodesk (correo, programa) no tiene un
 * titular que ocupe asiento en ese equipo. Es lo que se le resta al disponible
 * para no prometer una licencia que Autodesk ya dio. Incluye a los externos y a
 * quien falta marcar: los dos ocupan un asiento real.
 *
 * Coincide con el caso `coincide` del plan: un titular que ocupa y tiene el
 * correo (o está vinculado por alias a ese correo).
 */
export function contarAjenos(
  snapshot: readonly { teamId: string; softwareId: string; email: string }[],
  titulares: readonly TitularParaAjenos[],
  alias: readonly AliasDeCorreo[]
): Map<string, number> {
  const porAlias = new Map(alias.map((a) => [a.email, claveDePersona(a.ref)] as const));
  const ocupantes = new Map<string, TitularParaAjenos[]>();
  for (const t of titulares) {
    if (!t.ocupa) continue;
    const k = claveDeStock(t.teamId, t.softwareId);
    ocupantes.set(k, [...(ocupantes.get(k) ?? []), t]);
  }
  const salida = new Map<string, number>();
  const vistos = new Set<string>();
  for (const s of snapshot) {
    const k = claveDeStock(s.teamId, s.softwareId);
    const unico = `${k}|${s.email}`;
    if (vistos.has(unico)) continue;
    vistos.add(unico);
    const vinculada = porAlias.get(s.email);
    const cubierto = (ocupantes.get(k) ?? []).some(
      (t) => t.correos.includes(s.email) || (vinculada !== undefined && vinculada === claveDePersona(t.ref))
    );
    if (!cubierto) salida.set(k, (salida.get(k) ?? 0) + 1);
  }
  return salida;
}

/* ============================================================
 * Tareas pendientes en Autodesk: se cierran solas
 * ============================================================ */

/**
 * Con el archivo nuevo de un equipo, ¿qué tareas abiertas ya están hechas?
 * «Asignar»: el (correo, programa) ahora aparece. «Sacar»: ya no aparece. Una
 * tarea sin correo no se puede verificar contra el archivo y queda abierta.
 */
export function tareasQueSeCierran(
  tareas: readonly TareaAbierta[],
  autodesk: readonly Pick<FilaDeAutodesk, "email" | "softwareId">[],
  teamId: string
): string[] {
  const hay = new Set(autodesk.map((a) => `${a.email}|${a.softwareId}`));
  const cerrar: string[] = [];
  for (const t of tareas) {
    if (t.teamId !== teamId || !t.email) continue;
    const aparece = hay.has(`${t.email}|${t.softwareId}`);
    if (t.kind === "asignar_en_autodesk" ? aparece : !aparece) cerrar.push(t.id);
  }
  return cerrar;
}

/* ============================================================
 * Conteo para la vista previa
 * ============================================================ */

export function contarCasos(casos: readonly CasoDeConciliacion[]): Record<TipoDeCaso, number> {
  const cuenta: Record<TipoDeCaso, number> = {
    coincide: 0,
    falta_en_campus: 0,
    externo: 0,
    falta_en_autodesk: 0,
    en_otro_equipo: 0,
    curso_terminado: 0,
  };
  for (const c of casos) cuenta[c.tipo]++;
  return cuenta;
}

/** Cuántos importes guardados se conservan por equipo. */
export const IMPORTACIONES_POR_EQUIPO = 6;
