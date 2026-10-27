import type { Capability } from "@/lib/capabilities";
import type { CourseKind } from "@/lib/course-kind";
import { estadoDeClase, type RelojDeAsistencia } from "@/lib/attendance-percentage";
import { avisoSinConfirmarQueToca, grupoRecibeAvisoSinConfirmar } from "@/lib/avisos-sin-confirmar";
import { enLaVista } from "@/lib/facturacion";
import { diasHastaElInicio } from "@/lib/staff-notices";
import { origenDelFormulario } from "@/lib/seguimiento";

/**
 * 2026-10-26 — "Hoy": lo que la persona que entra tiene que resolver, con el
 * enlace exacto a donde se resuelve.
 *
 * Las tareas son DERIVADAS, nunca guardadas (como `tipoDeContacto` o el
 * vencimiento de accesos): se calculan al leer, y una tarea desaparece sola
 * cuando el dato de abajo se arregla — se pasa lista y la clase sale de la
 * bandeja. No hay tabla de tareas, ni casilla de "hecho", ni posponer.
 *
 * Cada regla REUSA la regla única que ya existe para su dato; acá no se
 * vuelve a decidir qué es una clase dictada, un grupo sin confirmar o una
 * venta sin factura. Puro: la lectura vive en `src/server/tareas-del-dia.ts`,
 * que solo consulta los datos de las reglas que la sesión puede ver.
 */

export type ReglaDeTarea = "asistencia_zoom" | "asistencia" | "confirmar" | "facturar" | "leads";
export type Urgencia = "alta" | "media";

export type TareaDeHoy = {
  ruleId: ReglaDeTarea;
  titulo: string;
  detalle?: string;
  href: string;
  urgencia: Urgencia;
  /** `AAAA-MM-DD`, el día al que se refiere (la clase, el inicio). */
  fecha?: string;
};

export type GrupoDeTareas = {
  ruleId: ReglaDeTarea;
  titulo: string;
  /** "6 clases sin pasar". */
  resumen: string;
  /** La de su item más urgente. */
  urgencia: Urgencia;
  items: TareaDeHoy[];
};

/**
 * Las reglas, en el orden en que se muestran a igual urgencia, con las
 * capacidades que pide cada una (TODAS). Incluyen la de la acción que la
 * resuelve: quien ve la tarea puede resolverla (o, en Facturación, ver la
 * pantalla donde se resuelve).
 *
 * Asistencia pide además `grabaciones.gestionar`: Soporte puede pasar lista,
 * pero la responsabilidad es de Coordinación (2026-10-26), así que la tarea
 * le llega solo a quien coordina las clases.
 */
export const REGLAS_DE_TAREAS = [
  {
    // Constitución 1.9.0 — antes que "sin pasar": revisar una sugerencia es
    // más rápido que pasar lista, y la misma clase nunca está en las dos.
    id: "asistencia_zoom",
    capacidades: ["asistencia.editar", "grabaciones.gestionar"],
    titulo: "Asistencia sugerida para revisar",
    unidad: ["clase con asistencia sugerida", "clases con asistencia sugerida"],
  },
  {
    id: "asistencia",
    capacidades: ["asistencia.editar", "grabaciones.gestionar"],
    titulo: "Asistencia sin pasar",
    unidad: ["clase sin pasar", "clases sin pasar"],
  },
  {
    id: "confirmar",
    capacidades: ["cohortes.confirmar"],
    titulo: "Grupos por confirmar",
    unidad: ["grupo por confirmar", "grupos por confirmar"],
  },
  {
    id: "facturar",
    capacidades: ["cobranza.ver"],
    titulo: "Pendientes de facturar",
    unidad: ["grupo con ventas sin factura", "grupos con ventas sin factura"],
  },
  {
    id: "leads",
    capacidades: ["inscripciones.seguimiento"],
    titulo: "Interesados sin contactar",
    unidad: ["interesado sin contactar", "interesados sin contactar"],
  },
] as const satisfies readonly {
  id: ReglaDeTarea;
  capacidades: readonly Capability[];
  titulo: string;
  unidad: readonly [string, string];
}[];

/** Las reglas que la sesión puede ver; las demás ni se consultan. */
export function reglasPermitidas(capacidades: readonly Capability[]): ReglaDeTarea[] {
  return REGLAS_DE_TAREAS.filter((r) => r.capacidades.every((c) => capacidades.includes(c))).map(
    (r) => r.id
  );
}

/* ============================================================ utilidades */

const nombreDeGrupo = (courseName: string, cohortName: string | null) =>
  cohortName?.trim() ? `${courseName} — ${cohortName.trim()}` : courseName;

/** `cohort.start_date` / `class_session.date` se guardan a medianoche UTC del día. */
const diaGuardado = (d: Date) => d.toISOString().slice(0, 10);

function cuandoEmpieza(faltan: number): string {
  if (faltan < 0) return "ya empezó";
  if (faltan === 0) return "empieza hoy";
  if (faltan === 1) return "empieza mañana";
  return `empieza en ${faltan} días`;
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ============================================================ 1. asistencia */

/** Cuántos días atrás se miran las clases: lo viejo no inunda la bandeja. */
export const DIAS_DE_ASISTENCIA = 14;

export type ClaseParaTarea = {
  classSessionId: string;
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  courseKind: CourseKind | null;
  date: Date;
  endTime: string | null;
  canceled: boolean;
  /** Inscripciones del grupo con el contacto activo. */
  inscriptosActivos: number;
  /** Marcas de asistencia de cualquier alumno en esta clase. */
  marcas: number;
  /**
   * Constitución 1.9.0 — Zoom ya trajo quién se conectó y nadie lo confirmó
   * todavía (traída `lista`, sin revisar). Esa clase va a "Asistencia
   * sugerida para revisar", no a "sin pasar".
   */
  sugerenciaZoom?: boolean;
};

/**
 * Una clase REAL (las proyectadas no son filas), DICTADA según
 * `estadoDeClase` (terminó en la zona de la academia y no está cancelada),
 * con alumnos activos y sin una sola marca. Un taller no es una cursada.
 * Asistencia y grabaciones son de Coordinación (2026-10-26): el profesor no
 * la recibe porque su portal no tiene capacidades.
 */
export function tareasDeAsistencia(
  clases: readonly ClaseParaTarea[],
  reloj: RelojDeAsistencia
): TareaDeHoy[] {
  const out: TareaDeHoy[] = [];
  for (const c of clases) {
    if (c.courseKind === "taller" || c.inscriptosActivos <= 0 || c.marcas > 0) continue;
    if (c.sugerenciaZoom) continue;
    if (estadoDeClase({ sessionDate: c.date, endTime: c.endTime, canceled: c.canceled }, reloj) !== "dictada") {
      continue;
    }
    const hace = -(diasHastaElInicio(c.date, reloj.now, reloj.timeZone) ?? 0);
    if (hace > DIAS_DE_ASISTENCIA) continue;
    out.push({
      ruleId: "asistencia",
      titulo: nombreDeGrupo(c.courseName, c.cohortName),
      detalle: hace === 0 ? "Clase de hoy" : hace === 1 ? "Clase de ayer" : `Clase de hace ${hace} días`,
      href: `/cohorts/${c.cohortId}?tab=asistencia`,
      urgencia: hace > 3 ? "alta" : "media",
      fecha: diaGuardado(c.date),
    });
  }
  return out;
}

/**
 * Constitución 1.9.0 (decisión del dueño, 2026-10-27) — Las clases con una
 * sugerencia de Zoom LISTA y sin confirmar: dictadas, con alumnos, sin una
 * sola marca y no de un taller, como "sin pasar", pero SIN el corte de 14
 * días (el relleno hacia atrás trae clases viejas que también hay que
 * revisar). Lleva a la planilla con la clase elegida.
 */
export function tareasDeSugerenciasDeZoom(
  clases: readonly ClaseParaTarea[],
  reloj: RelojDeAsistencia
): TareaDeHoy[] {
  const out: TareaDeHoy[] = [];
  for (const c of clases) {
    if (!c.sugerenciaZoom) continue;
    if (c.courseKind === "taller" || c.inscriptosActivos <= 0 || c.marcas > 0) continue;
    if (estadoDeClase({ sessionDate: c.date, endTime: c.endTime, canceled: c.canceled }, reloj) !== "dictada") {
      continue;
    }
    const hace = -(diasHastaElInicio(c.date, reloj.now, reloj.timeZone) ?? 0);
    out.push({
      ruleId: "asistencia_zoom",
      titulo: nombreDeGrupo(c.courseName, c.cohortName),
      detalle: hace === 0 ? "Clase de hoy" : hace === 1 ? "Clase de ayer" : `Clase de hace ${hace} días`,
      href: `/cohorts/${c.cohortId}?tab=asistencia&clase=${c.classSessionId}`,
      urgencia: hace > 3 ? "alta" : "media",
      fecha: diaGuardado(c.date),
    });
  }
  return out;
}

/* ============================================================ 2. confirmar */

export type GrupoParaConfirmar = {
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  courseKind: CourseKind | null;
  parentCohortId: string | null;
  startDate: Date;
  confirmedAt: Date | null;
  status: "planificada" | "en_curso" | "finalizada";
};

/**
 * La MISMA ventana que el aviso por correo de grupo sin confirmar
 * (`avisoSinConfirmarQueToca`: de 7 días antes al día de inicio, en la zona
 * de la academia) y los mismos grupos (`grupoRecibeAvisoSinConfirmar`: ni
 * talleres ni módulos). Uno finalizado no se confirma.
 */
export function tareasDeConfirmacion(
  grupos: readonly GrupoParaConfirmar[],
  reloj: RelojDeAsistencia
): TareaDeHoy[] {
  const out: TareaDeHoy[] = [];
  for (const g of grupos) {
    if (g.status === "finalizada" || !grupoRecibeAvisoSinConfirmar(g)) continue;
    if (avisoSinConfirmarQueToca(g, reloj.now, reloj.timeZone) === null) continue;
    const faltan = diasHastaElInicio(g.startDate, reloj.now, reloj.timeZone) ?? 0;
    out.push({
      ruleId: "confirmar",
      titulo: nombreDeGrupo(g.courseName, g.cohortName),
      detalle: mayuscula(cuandoEmpieza(faltan)),
      // El control de confirmación vive en el encabezado del grupo.
      href: `/cohorts/${g.cohortId}`,
      urgencia: faltan <= 2 ? "alta" : "media",
      fecha: diaGuardado(g.startDate),
    });
  }
  return out;
}

/* ============================================================ 3. facturar */

/** Desde cuántos días ANTES del inicio (el aviso de T-7) y hasta cuántos DESPUÉS. */
export const VENTANA_DE_FACTURACION = { antes: 7, despues: 30 } as const;

/** Una venta, sin montos: la bandeja no los necesita y no los lleva. */
export type VentaParaFacturar = {
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  courseKind: CourseKind | null;
  parentEnrollmentId: string | null;
  deBaja: boolean;
  invoiceNumber: string | null;
  startDate: Date;
};

/**
 * Las ventas que la pantalla de Facturación muestra en Pendientes (`enLaVista`,
 * que es `pendienteDeFacturar` — la regla del aviso de T-7/T-2), agrupadas
 * por grupo. Solo los grupos que empiezan en los próximos 7 días o empezaron
 * hace menos de 30: lo de hace meses ya es otra conversación, y está en la
 * pantalla. Sin un solo monto.
 */
export function tareasDeFacturacion(
  ventas: readonly VentaParaFacturar[],
  reloj: RelojDeAsistencia
): TareaDeHoy[] {
  const porGrupo = new Map<string, { venta: VentaParaFacturar; faltan: number; n: number }>();
  for (const v of ventas) {
    if (!enLaVista(v, "pendientes")) continue;
    const faltan = diasHastaElInicio(v.startDate, reloj.now, reloj.timeZone);
    if (faltan === null) continue;
    if (faltan > VENTANA_DE_FACTURACION.antes || faltan < -VENTANA_DE_FACTURACION.despues) continue;
    const previo = porGrupo.get(v.cohortId);
    if (previo) previo.n += 1;
    else porGrupo.set(v.cohortId, { venta: v, faltan, n: 1 });
  }
  return [...porGrupo.values()].map(({ venta: v, faltan, n }) => ({
    ruleId: "facturar",
    titulo: nombreDeGrupo(v.courseName, v.cohortName),
    detalle: `${n} ${n === 1 ? "inscripción" : "inscripciones"} sin factura · ${cuandoEmpieza(faltan)}`,
    href: `/facturacion?tab=pendientes&grupo=${encodeURIComponent(v.cohortId)}`,
    urgencia: faltan <= 2 ? "alta" : "media",
    fecha: diaGuardado(v.startDate),
  }));
}

/* ============================================================ 4. leads */

const HORA_MS = 60 * 60 * 1000;
/** Lo que se espera antes de que un formulario sin respuesta sea tarea. */
export const HORAS_PARA_CONTACTAR = 24;
/** Cuántos días atrás se miran los formularios. */
export const DIAS_DE_LEADS = 30;

export type EnvioParaTarea = {
  contactId: string;
  nombre: string;
  source: string;
  interestName: string | null;
  submittedAt: Date;
  /** La última `contact_activity` del contacto (nota o "le escribí"), si hay. */
  ultimaActividad: Date | null;
};

/**
 * Un formulario público (`contact_form_submission`) de hace más de 24 horas
 * sin ninguna actividad del seguimiento POSTERIOR. Basta con la última
 * actividad del contacto: si es posterior al envío, también lo es a los
 * anteriores. Una tarea por persona: la del envío más viejo sin respuesta.
 */
export function tareasDeLeads(envios: readonly EnvioParaTarea[], now: Date): TareaDeHoy[] {
  const porContacto = new Map<string, { envio: EnvioParaTarea; horas: number }>();
  for (const e of envios) {
    const horas = (now.getTime() - e.submittedAt.getTime()) / HORA_MS;
    if (horas < HORAS_PARA_CONTACTAR || horas > DIAS_DE_LEADS * 24) continue;
    if (e.ultimaActividad && e.ultimaActividad.getTime() > e.submittedAt.getTime()) continue;
    const previo = porContacto.get(e.contactId);
    if (!previo || horas > previo.horas) porContacto.set(e.contactId, { envio: e, horas });
  }
  return [...porContacto.values()].map(({ envio: e, horas }) => {
    const origen = origenDelFormulario(e.source, e.interestName);
    const interes = e.interestName?.trim();
    return {
      ruleId: "leads",
      titulo: e.nombre,
      detalle: interes && !origen.includes(interes) ? `${origen} · ${interes}` : origen,
      href: `/contacts/${e.contactId}/legajo?tab=seguimiento`,
      urgencia: horas > 72 ? "alta" : "media",
      fecha: e.submittedAt.toISOString().slice(0, 10),
    } satisfies TareaDeHoy;
  });
}

/* ============================================================ la bandeja */

const PESO: Record<Urgencia, number> = { alta: 0, media: 1 };
const ORDEN_DE_REGLA = new Map<ReglaDeTarea, number>(REGLAS_DE_TAREAS.map((r, i) => [r.id, i]));

/**
 * Una entrada por regla con sus items, la más urgente primero (a igual
 * urgencia, en el orden de `REGLAS_DE_TAREAS`). Adentro, lo urgente primero y
 * después lo más viejo.
 */
export function armarBandeja(tareas: readonly TareaDeHoy[]): GrupoDeTareas[] {
  const grupos: GrupoDeTareas[] = [];
  for (const regla of REGLAS_DE_TAREAS) {
    const items = tareas
      .filter((t) => t.ruleId === regla.id)
      .sort(
        (a, b) =>
          PESO[a.urgencia] - PESO[b.urgencia] ||
          (a.fecha ?? "").localeCompare(b.fecha ?? "") ||
          a.titulo.localeCompare(b.titulo, "es")
      );
    const primero = items[0];
    if (!primero) continue;
    const n = items.length;
    grupos.push({
      ruleId: regla.id,
      titulo: regla.titulo,
      resumen: `${n} ${n === 1 ? regla.unidad[0] : regla.unidad[1]}`,
      urgencia: primero.urgencia,
      items,
    });
  }
  return grupos.sort(
    (a, b) =>
      PESO[a.urgencia] - PESO[b.urgencia] ||
      (ORDEN_DE_REGLA.get(a.ruleId) ?? 0) - (ORDEN_DE_REGLA.get(b.ruleId) ?? 0)
  );
}
