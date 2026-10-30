"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  Route,
  ClipboardList,
  Trash2,
} from "lucide-react";
import type {
  CohortDto,
  CourseCategoryDto,
  CourseDto,
  SoftwareDto,
  TeacherDto,
} from "@/lib/types";
import { cn, formatAmount, formatCalendarDay, WEEKDAY_LABELS } from "@/lib/utils";
import {
  TODOS_LOS_ANIOS,
  alternarTipo,
  contadoresDeCohortes,
  contarCursosPorTipo,
  filtrarCohortes,
  filtrarCursos,
  leerFiltroDeAnio,
  sinFechas,
  type FiltroDeAnio,
} from "@/lib/academic-filters";
import { COURSE_KINDS, COURSE_KIND_LABEL, type CourseKind } from "@/lib/course-kind";
import { resumenDeDuracion } from "@/lib/course-duration";
import {
  porcentajeDeProgreso,
  sumarProgresos,
  type ProgresoDeCursada,
} from "@/lib/cohort-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CohortForm } from "@/components/academic/cohort-form";
import { CourseForm } from "@/components/academic/course-form";
import { NextCoursesDialog } from "@/components/academic/next-courses-dialog";
import { AssessmentModelsDialog } from "@/components/academic/assessment-models-dialog";
import { TeacherForm } from "@/components/academic/teacher-form";
import { TeacherLicensesDialog } from "@/components/academic/teacher-licenses-dialog";
import { RoomsPanel } from "@/components/academic/rooms-panel";
import { EtiquetaDeTipo, SegmentadoDeEstado } from "@/components/academic/academic-toolbar";
import { AvatarDeCurso, TONO_DE_ESTADO } from "@/components/listados/curso-visual";
import {
  Buscador,
  Desplegable,
  EncabezadoDeSeccion,
  OpcionAccion,
  OpcionMarcable,
  OpcionUnica,
  Resaltado,
  ResumenDeFiltros,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import { notify } from "@/lib/notify";
import type { PestanaAcademico } from "@/lib/pestanas";
import { usePestanaEnUrl } from "@/components/use-pestana-en-url";

const TABS: readonly { key: PestanaAcademico; label: string }[] = [
  { key: "cursos", label: "Cursos" },
  { key: "grupos", label: "Grupos" },
  { key: "profesores", label: "Profesores" },
  // 023 — Las salas de reunión. Van acá y no en Configuración porque se tocan
  // armando el cronograma, no una vez al instalar.
  { key: "aulas", label: "Aulas" },
];
type Tab = PestanaAcademico;
type Estado = CohortDto["status"];

/** Centésimos → "$5.245,32" en la moneda dada (`src/lib/money.ts`). */
function formatCost(cost: number | null, currency?: string) {
  return formatAmount(cost, currency);
}

/** Inicio y fin de grupo: DÍAS (medianoche UTC), no instantes. "9 nov." o "9 nov. 2025". */
function formatDia(iso: string | null, anioActual: number) {
  if (!iso) return "—";
  const mismoAnio = new Date(iso).getUTCFullYear() === anioActual;
  return formatCalendarDay(
    iso,
    mismoAnio ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }
  );
}

/** "Lun, Mié · 18:30–21:30": el horario en una pieza del subtítulo. */
function formatHorario(cohort: CohortDto): string | null {
  const dias = cohort.daysOfWeek
    ? cohort.daysOfWeek
        .split(",")
        .map((d) => WEEKDAY_LABELS[Number(d)])
        .filter(Boolean)
        .join(", ")
    : cohort.frequency;
  const hora = cohort.startTime ? `${cohort.startTime}${cohort.endTime ? `–${cohort.endTime}` : ""}` : null;
  const partes = [dias, hora].filter((p): p is string => Boolean(p));
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** El orden de los estados para `nextStatusFilter` (y su conjunto "todos"). */
const STATUS_ORDER: Estado[] = ["planificada", "en_curso", "finalizada"];
/** El orden en que se DIBUJAN: lo que está pasando primero. */
const ORDEN_DE_SECCION: Estado[] = ["en_curso", "planificada", "finalizada"];

const ETIQUETA_DE_ESTADO: Record<Estado, string> = {
  en_curso: "En curso",
  planificada: "Planificados",
  finalizada: "Finalizados",
};

/**
 * 007 — Qué estados quedan seleccionados al tocar un chip del filtro.
 *
 * Es una función pura y exportada A PROPÓSITO: la primera versión de este
 * filtro invertía la selección (tocar "Planificada" dejaba las OTRAS dos) y
 * ni typecheck ni build lo detectaron, porque era lógica de interacción. Con
 * esto separado, el caso queda cubierto por tests.
 *
 * Reglas: desde "todas" seleccionadas, tocar un estado significa "solo
 * este"; después suma/saca de a uno; y quedarse sin ninguno equivale a no
 * filtrar, así que vuelve a todas.
 *
 * 2026-10-26 — El control ahora es un segmentado (Todos · En curso ·
 * Planificados · Finalizados), pero sigue siendo de selección MÚLTIPLE con
 * estas mismas reglas: el caso diario es ver planificados + en curso a la
 * vez, sin el archivo de finalizados.
 */
export function nextStatusFilter(
  current: ReadonlySet<Estado>,
  clicked: Estado,
  all: readonly Estado[] = STATUS_ORDER
): Set<Estado> {
  if (current.size === all.length) return new Set([clicked]);
  const next = new Set(current);
  if (next.has(clicked)) next.delete(clicked);
  else next.add(clicked);
  return next.size === 0 ? new Set(all) : next;
}

/** 032 (FR-011) — Dónde se recuerda el último año elegido, por persona y navegador. */
const CLAVE_FILTRO_ANIO = "academico.cohortes.anio";

const TODOS_LOS_TIPOS: ReadonlySet<CourseKind> = new Set(COURSE_KINDS);

/** "Todos" o "Curso, Taller": el valor visible del filtro de tipo. */
function etiquetaDeTipos(tipos: ReadonlySet<CourseKind>): string {
  if (tipos.size === COURSE_KINDS.length) return "Todos";
  return COURSE_KINDS.filter((k) => tipos.has(k))
    .map((k) => COURSE_KIND_LABEL[k])
    .join(", ");
}

/** "Clase 6 de 10 · 60 %" con su barra. */
function BarraDeProgreso({ progreso }: { progreso: ProgresoDeCursada }) {
  const pct = porcentajeDeProgreso(progreso);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Clase {progreso.dictadas} de {progreso.total}
        </span>
        <span className="tabular-nums">{pct} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Clase ${progreso.dictadas} de ${progreso.total}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-accent"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "14 / 16 inscriptos", "15 / 15 · completo" (en tono de aviso) o "9 inscriptos". */
function Cupos({ inscriptos, cupo }: { inscriptos: number; cupo: number | null }) {
  if (cupo === null || cupo <= 0) {
    return (
      <span className="text-[12.5px] text-text-2">
        {inscriptos} {inscriptos === 1 ? "inscripto" : "inscriptos"}
      </span>
    );
  }
  const completo = inscriptos >= cupo;
  return (
    <span className={cn("text-[12.5px] tabular-nums", completo ? "font-medium text-warning" : "text-text-2")}>
      {inscriptos} / {cupo}
      {completo ? " · completo" : " inscriptos"}
    </span>
  );
}

/**
 * 005 (T014, US1) — pantalla de gestión académica. Iteración 2 (feedback en
 * vivo del dueño) suma pestañas Cursos/Software/Profesores: antes solo se
 * podían crear desde selectores dentro del formulario de cohorte, sin forma
 * de verlos listados ni editarlos fuera de ahí.
 *
 * 2026-10-16 (pedido del dueño) — El catálogo de software (alta, nombre,
 * foto, total) se mudó a /licencias. Acá la lista se sigue pidiendo a
 * `/api/software` porque la usan el formulario de cohorte y las tarjetas.
 *
 * 040 (DV-008) — Las capacidades bajan del servidor como booleanos: sin
 * `academico.editar` (Ventas, Administración) no se dibujan crear, editar ni
 * borrar —las rutas responderían 403—, y sin `accesos.gestionar` no se ofrece
 * dar acceso a un profesor. La pantalla sigue entera en lectura.
 *
 * 2026-10-26 — Cursos y Grupos con buscador y UNA barra de filtros (estado,
 * año, tipo), resumen "Mostrando N de M" con etiquetas quitables, y listas con
 * color: avatar por curso (paleta categórica), progreso de la cursada, cupos y
 * tipo. La lógica de filtrado sigue en `src/lib/academic-filters.ts`.
 */
export function AcademicClient({
  canEdit = false,
  canManageAccess = false,
  canManageLicenses = false,
  initialTab = "cursos",
}: {
  /** `academico.editar`: cursos, cohortes, profesores y aulas. */
  canEdit?: boolean;
  /** `accesos.gestionar`: el acceso al portal de un profesor. */
  canManageAccess?: boolean;
  /** `licencias.gestionar`: asignar y quitar las licencias de un profesor (0090). */
  canManageLicenses?: boolean;
  /** Pestaña inicial, de `?tab=` (la valida el servidor con `leerPestana`). */
  initialTab?: PestanaAcademico;
}) {
  const [tab, setTab] = usePestanaEnUrl<Tab>(initialTab);
  /**
   * 007 — filtro por estado del grupo. Es un conjunto y no un valor único
   * porque el caso más pedido es ver dos a la vez (planificados + en curso) y
   * esconder el archivo de finalizados. Arranca con los tres marcados.
   */
  const [statusFilter, setStatusFilter] = useState<Set<Estado>>(new Set(STATUS_ORDER));
  /**
   * 032 (FR-009) — Tipo en la pestaña Cursos: arranca en "solo Curso", que es
   * lo que más se consulta; los módulos se gestionan desde su especialización.
   */
  const [courseKindFilter, setCourseKindFilter] = useState<Set<CourseKind>>(
    new Set(["curso"])
  );
  /**
   * 032 (FR-013) — Tipo en la pestaña Grupos. Arranca con los tres: el
   * listado no tiene que perder ninguno el día del despliegue.
   */
  const [cohortKindFilter, setCohortKindFilter] = useState<Set<CourseKind>>(
    new Set(COURSE_KINDS)
  );
  /**
   * 2026-10-26 — El texto de cada buscador. Uno por pestaña: lo que se buscó
   * en Grupos no tiene por qué vaciar Cursos. No va a la URL: es una consulta
   * de un momento, no un lugar al que se vuelve.
   */
  const [busquedaCursos, setBusquedaCursos] = useState("");
  const [busquedaGrupos, setBusquedaGrupos] = useState("");
  /**
   * 032 (FR-011) — Año. "Todos los años" la primera vez, para que nadie
   * piense que se perdieron cohortes; después, la última elección de esta
   * persona. Se lee DESPUÉS de montar: el servidor no conoce el
   * `localStorage`, y leerlo en el primer render desincroniza la hidratación.
   */
  const [yearFilter, setYearFilter] = useState<FiltroDeAnio>(TODOS_LOS_ANIOS);
  useEffect(() => {
    try {
      setYearFilter(leerFiltroDeAnio(window.localStorage.getItem(CLAVE_FILTRO_ANIO)));
    } catch {
      // Almacenamiento bloqueado (ventana privada, datos borrados): queda el default.
    }
  }, []);
  function elegirAnio(next: FiltroDeAnio) {
    setYearFilter(next);
    try {
      window.localStorage.setItem(CLAVE_FILTRO_ANIO, String(next));
    } catch {
      // Sin almacenamiento el filtro funciona igual; solo no se recuerda.
    }
  }
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  const [teachers, setTeachers] = useState<TeacherDto[]>([]);
  const [software, setSoftware] = useState<SoftwareDto[]>([]);
  const [categories, setCategories] = useState<CourseCategoryDto[]>([]);
  const [loadError, setLoadError] = useState(false);
  /** 046 (US2) — Rutas entre cursos: origen → siguientes en orden. */
  const [rutas, setRutas] = useState<Map<string, string[]>>(new Map());
  const [rutaDe, setRutaDe] = useState<CourseDto | null>(null);
  /** 0084 — De qué curso están abiertas las evaluaciones modelo. */
  const [modelosDe, setModelosDe] = useState<CourseDto | null>(null);
  const [showCourseForm, setShowCourseForm] = useState<
    { mode: "create" } | { mode: "edit"; course: CourseDto } | null
  >(null);
  const [cohortForm, setCohortForm] = useState<
    { mode: "create" } | { mode: "edit"; cohort: CohortDto } | null
  >(null);
  /** 014 — Invitación al portal y baja del profesor. */
  const [invitando, setInvitando] = useState<string | null>(null);
  /** 023 — Qué cohorte se está borrando, y qué contestó el servidor. */
  const [borrando, setBorrando] = useState<string | null>(null);
  /**
   * La contraseña temporal del profesor recién invitado. Se queda INLINE (no
   * en toast): se muestra una sola vez y hay que leerla o dictarla. El resto
   * de los resultados (baja, errores, cuenta existente) van en toast.
   */
  const [accesoProfesor, setAccesoProfesor] = useState<string | null>(null);

  async function borrarCohorte(cohort: CohortDto) {
    const nombre = cohort.name ?? cohort.courseName;
    if (!confirm(`¿Borrar "${nombre}"? Sus clases sin asistencia se borran con él. Si tiene inscriptos o clases ya dictadas, no se va a poder.`)) {
      return;
    }

    setBorrando(cohort.id);
    const res = await fetch(`/api/cohorts/${cohort.id}`, { method: "DELETE" }).catch(
      () => null
    );
    setBorrando(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo borrar el grupo.");
      return;
    }

    setCohorts((prev) => prev.filter((c) => c.id !== cohort.id));
    notify.success(`"${nombre}" fue borrada.`);
  }

  async function invitarProfesor(teacherId: string) {
    setInvitando(teacherId);
    setAccesoProfesor(null);
    const res = await fetch(`/api/teachers/${teacherId}/access`, {
      method: "POST",
    }).catch(() => null);
    setInvitando(null);

    const data = (await res?.json().catch(() => null)) as
      | {
          error?: { message?: string };
          temporaryPassword?: string | null;
          emailError?: string | null;
        }
      | null;

    if (!res?.ok) {
      notify.error(data?.error?.message ?? "No se pudo dar el acceso");
      return;
    }

    if (!data?.temporaryPassword) {
      notify.success(
        "Esa persona ya tenía cuenta; se le habilitó el portal y entra con su contraseña de siempre."
      );
      return;
    }

    /**
     * 014 — El correo puede no haber salido, y decir que salió sería mentir
     * sobre lo único que la persona necesita para entrar. El acceso se creó
     * igual: la contraseña está acá y hay que dictarla.
     */
    setAccesoProfesor(
      data.emailError
        ? `Creamos el acceso, pero el correo no se pudo enviar (${data.emailError}). La contraseña temporal es ${data.temporaryPassword}: compartila por otro medio, porque no se va a volver a mostrar.`
        : `Acceso creado y correo enviado. Contraseña temporal: ${data.temporaryPassword} (no se va a volver a mostrar).`
    );
    // El toast ANUNCIA; la contraseña sigue en la pantalla.
    if (data.emailError) {
      notify.warning("Acceso creado, pero el correo no se pudo enviar.", {
        description: "La contraseña temporal está en la pantalla: compartila por otro medio.",
      });
    } else {
      notify.success("Acceso creado y correo enviado.");
    }
  }

  /**
   * 014 (T008, DV-008) — Baja del profesor.
   *
   * El servidor decide: con cohortes asignadas responde 409 diciendo cuántas.
   * El navegador solo muestra ese mensaje — la barrera no vive acá.
   */
  async function bajaProfesor(teacherId: string, nombre: string) {
    const res = await fetch(`/api/teachers/${teacherId}`, {
      method: "DELETE",
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; cohorts?: number }
      | null;

    if (!res?.ok) {
      notify.error(data?.error?.message ?? "No se pudo dar de baja");
      return;
    }
    notify.success(`${nombre} fue dado de baja.`);
    void refetch();
  }

  const [teacherForm, setTeacherForm] = useState<
    { mode: "create" } | { mode: "edit"; teacher: TeacherDto } | null
  >(null);
  /** 0090 — El profesor cuyas licencias se están viendo. */
  const [teacherLicenses, setTeacherLicenses] = useState<TeacherDto | null>(null);

  /**
   * 028 (seguimiento) — Lo que queda después del filtro, con cada módulo
   * adentro de su especialización (`agruparEspecializaciones`, pura y con
   * tests). Una madre se muestra si ella o alguno de sus módulos coincide.
   *
   * 032 (FR-011/FR-013) + 2026-10-26 — estado, año, tipo y búsqueda a la vez
   * (`filtrarCohortes`, pura); los contadores salen con los DEMÁS aplicados.
   */
  const filtrosDeCohortes = {
    estados: statusFilter,
    anio: yearFilter,
    tipos: cohortKindFilter,
    busqueda: busquedaGrupos,
  };
  const grupos = filtrarCohortes(cohorts, filtrosDeCohortes);
  const anioActual = new Date().getFullYear();
  const contadores = contadoresDeCohortes(cohorts, filtrosDeCohortes, anioActual);
  /** Todas las filas, sin ningún filtro: el "de M" del resumen y las pastillas del encabezado. */
  const todasLasFilas = filtrarCohortes(cohorts, {
    estados: new Set(STATUS_ORDER),
    anio: TODOS_LOS_ANIOS,
    tipos: TODOS_LOS_TIPOS,
  });
  const filasPorEstado = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, todasLasFilas.filter((g) => g.seccion === s).length])
  ) as Record<Estado, number>;

  const cursosVisibles = filtrarCursos(courses, courseKindFilter, busquedaCursos);
  const cursosPorTipo = contarCursosPorTipo(courses, busquedaCursos);
  const gruposPorCurso = new Map<string, number>();
  for (const c of cohorts) gruposPorCurso.set(c.courseId, (gruposPorCurso.get(c.courseId) ?? 0) + 1);

  /** Qué especializaciones están desplegadas. Arrancan plegadas. */
  const [desplegadas, setDesplegadas] = useState<Set<string>>(new Set());
  function alternar(id: string) {
    setDesplegadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function limpiarFiltrosDeGrupos() {
    setBusquedaGrupos("");
    setStatusFilter(new Set(STATUS_ORDER));
    elegirAnio(TODOS_LOS_ANIOS);
    setCohortKindFilter(new Set(COURSE_KINDS));
  }
  function limpiarFiltrosDeCursos() {
    setBusquedaCursos("");
    setCourseKindFilter(new Set(COURSE_KINDS));
  }

  const etiquetaDeAnio = (a: FiltroDeAnio) =>
    a === TODOS_LOS_ANIOS ? "Todos" : a === anioActual ? "Este año" : String(a);

  const filtrosActivosDeGrupos: FiltroActivo[] = [
    ...(busquedaGrupos.trim()
      ? [{ clave: "q", etiqueta: `“${busquedaGrupos.trim()}”`, quitar: () => setBusquedaGrupos("") }]
      : []),
    ...(statusFilter.size < STATUS_ORDER.length
      ? [
          {
            clave: "estado",
            etiqueta: ORDEN_DE_SECCION.filter((s) => statusFilter.has(s))
              .map((s) => ETIQUETA_DE_ESTADO[s])
              .join(" + "),
            quitar: () => setStatusFilter(new Set(STATUS_ORDER)),
          },
        ]
      : []),
    ...(yearFilter !== TODOS_LOS_ANIOS
      ? [
          {
            clave: "anio",
            etiqueta: `Año: ${etiquetaDeAnio(yearFilter)}`,
            quitar: () => elegirAnio(TODOS_LOS_ANIOS),
          },
        ]
      : []),
    ...(cohortKindFilter.size < COURSE_KINDS.length
      ? [
          {
            clave: "tipo",
            etiqueta: `Tipo: ${etiquetaDeTipos(cohortKindFilter)}`,
            quitar: () => setCohortKindFilter(new Set(COURSE_KINDS)),
          },
        ]
      : []),
  ];

  const filtrosActivosDeCursos: FiltroActivo[] = [
    ...(busquedaCursos.trim()
      ? [{ clave: "q", etiqueta: `“${busquedaCursos.trim()}”`, quitar: () => setBusquedaCursos("") }]
      : []),
    ...(courseKindFilter.size < COURSE_KINDS.length
      ? [
          {
            clave: "tipo",
            etiqueta: `Tipo: ${etiquetaDeTipos(courseKindFilter)}`,
            quitar: () => setCourseKindFilter(new Set(COURSE_KINDS)),
          },
        ]
      : []),
  ];

  const refetch = useCallback(async () => {
    setLoading(true);
    let failed = false;

    async function read<T>(url: string, apply: (data: T) => void) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        apply((await res.json()) as T);
      } catch {
        failed = true;
      }
    }

    try {
      await Promise.all([
        read<{ courses: CourseDto[] }>("/api/courses", (d) => setCourses(d.courses)),
        read<{ cohorts: CohortDto[] }>("/api/cohorts", (d) => setCohorts(d.cohorts)),
        read<{ teachers: TeacherDto[] }>("/api/teachers", (d) => setTeachers(d.teachers)),
        read<{ software: SoftwareDto[] }>("/api/software", (d) => setSoftware(d.software)),
        read<{ categories: CourseCategoryDto[] }>("/api/course-categories", (d) =>
          setCategories(d.categories)
        ),
        read<{ routes: { fromCourseId: string; toCourseIds: string[] }[] }>("/api/course-routes", (d) =>
          setRutas(new Map(d.routes.map((r) => [r.fromCourseId, r.toCourseIds])))
        ),
      ]);
    } finally {
      setLoadError(failed);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function courseNameFor(id: string) {
    return courses.find((c) => c.id === id)?.name ?? "—";
  }

  /**
   * 028 (seguimiento) — La fila de un grupo, la misma para la fila suelta y
   * para el módulo dentro de su especialización: dos copias se
   * desincronizarían en el primer dato nuevo que alguien le agregue.
   *
   * 2026-10-26 — Avatar del curso | nombre + profesor · horario | progreso (en
   * curso) o fecha | cupos | tipo y acciones. En pantallas angostas quedan
   * avatar, nombre y tipo.
   *
   * El módulo se titula con su ordinal ("Módulo 1 — …", `etiquetaDeModulo`),
   * nunca con la `position` guardada.
   */
  function filaDeGrupo(
    cohort: CohortDto,
    {
      titulo,
      progreso,
      modulos,
      estado = cohort.status,
    }: {
      titulo: string;
      /**
       * El estado que decide la columna del medio. En una especialización es
       * el de su SECCIÓN: la planificada cuyo módulo 1 ya empezó se lista en
       * "En curso" y muestra el avance de sus módulos.
       */
      estado?: Estado;
      progreso: ProgresoDeCursada | null;
      /** Solo en una especialización: cuántos módulos y si están desplegados. */
      modulos?: { cantidad: number; abierta: boolean };
    }
  ) {
    const q = busquedaGrupos;
    const horario = formatHorario(cohort);
    const nombreDelCurso =
      cohort.name && !cohort.name.toLowerCase().includes(cohort.courseName.toLowerCase())
        ? cohort.courseName
        : null;

    let medio: React.ReactNode;
    if (estado === "en_curso" && progreso) {
      medio = <BarraDeProgreso progreso={progreso} />;
    } else if (estado === "planificada") {
      medio = `Empieza el ${formatDia(cohort.startDate, anioActual)}`;
    } else if (estado === "finalizada") {
      medio = `Terminó el ${formatDia(cohort.endDate ?? cohort.startDate, anioActual)}`;
    } else {
      medio = `${formatDia(cohort.startDate, anioActual)} → ${formatDia(cohort.endDate, anioActual)}`;
    }

    return (
      <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-[11px] transition-colors hover:bg-subtle md:grid-cols-[38px_minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <AvatarDeCurso
          courseId={cohort.courseId}
          nombre={cohort.courseName}
          apagado={estado === "finalizada"}
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/cohorts/${cohort.id}`}
              className="min-w-0 truncate font-medium leading-snug hover:underline"
            >
              <Resaltado texto={titulo} busqueda={q} />
            </Link>
            {/*
              Llegó el día de inicio y nadie lo confirmó: la marca roja
              (`marcaDeConfirmacion`). El estado sigue saliendo de las fechas.
            */}
            {cohort.confirmationFlag === "sin_confirmar_vencido" && (
              <Badge variant="destructive" title="Llegó la fecha de inicio y el grupo no está confirmado">
                Sin confirmar
              </Badge>
            )}
            {/* 039 — confirmado ("sale"): lo que importa antes de empezar. */}
            {cohort.confirmedAt && cohort.status === "planificada" && (
              <Badge variant="success">Confirmado</Badge>
            )}
            {/* 032 (FR-012) — aparece con cualquier año, y se dice por qué. */}
            {sinFechas(cohort) && <Badge variant="warning">sin fechas</Badge>}
            {modulos && (
              <button
                type="button"
                aria-expanded={modulos.abierta}
                aria-controls={`modulos-${cohort.id}`}
                onClick={() => alternar(cohort.id)}
                className="inline-flex items-center gap-1 rounded-full border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-text transition-colors hover:bg-accent"
              >
                {modulos.abierta ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
                Especialización · {modulos.cantidad} {modulos.cantidad === 1 ? "módulo" : "módulos"}
              </button>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {nombreDelCurso && (
              <>
                <Resaltado texto={nombreDelCurso} busqueda={q} />
                {" · "}
              </>
            )}
            {/*
              Una especialización no tiene profesor propio: lo tiene cada
              módulo. Marcarle "sin profesor" sería pedir un dato que ninguna
              pantalla lee.
            */}
            {cohort.isSpecialization ? (
              "Varios profesores"
            ) : cohort.teacher ? (
              <Resaltado texto={cohort.teacher.name} busqueda={q} />
            ) : (
              <span className="text-warning">sin profesor</span>
            )}
            {horario && ` · ${horario}`}
          </p>
        </div>

        <div className="hidden min-w-0 text-[13px] text-text-2 md:block">{medio}</div>

        <div className="hidden md:block">
          <Cupos inscriptos={cohort.enrolledCount ?? 0} cupo={cohort.capacity} />
        </div>

        <div className="flex items-center justify-end gap-1">
          <EtiquetaDeTipo kind={cohort.courseKind} />
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Editar ${titulo}`}
                title="Editar"
                onClick={() => setCohortForm({ mode: "edit", cohort })}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Borrar ${titulo}`}
                title="Borrar"
                loading={borrando === cohort.id}
                onClick={() => void borrarCohorte(cohort)}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-success-soft text-brand"
          >
            <GraduationCap className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Académico</h2>
            <p className="text-[13px] text-muted-foreground">Cursos, grupos, profesores y aulas</p>
          </div>
        </div>
        {/* Qué está pasando, de un vistazo: el punto de "en curso" late. */}
        {!loading && todasLasFilas.length > 0 && (
          <ul aria-label="Resumen de grupos" className="flex flex-wrap gap-2">
            <li className="inline-flex items-center gap-2 rounded-full bg-success-soft py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-success">
              <span aria-hidden className="latido h-2 w-2 rounded-full bg-success" />
              <b className="text-[15px] tabular-nums">{filasPorEstado.en_curso}</b> en curso
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-brand-soft py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-brand-text">
              <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
              <b className="text-[15px] tabular-nums">{filasPorEstado.planificada}</b> por empezar
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-accent py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-text-3">
              <span aria-hidden className="h-2 w-2 rounded-full bg-text-4" />
              <b className="text-[15px] tabular-nums">{filasPorEstado.finalizada}</b>{" "}
              {filasPorEstado.finalizada === 1 ? "finalizado" : "finalizados"}
            </li>
          </ul>
        )}
        <div className="flex items-center gap-2">
          {canEdit && tab === "grupos" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowCourseForm({ mode: "create" })}>
                <Plus className="h-4 w-4" /> Nuevo curso
              </Button>
              <Button
                size="sm"
                disabled={courses.length === 0}
                onClick={() => setCohortForm({ mode: "create" })}
              >
                <Plus className="h-4 w-4" /> Nuevo grupo
              </Button>
            </>
          )}
          {canEdit && tab === "cursos" && (
            <Button size="sm" onClick={() => setShowCourseForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nuevo curso
            </Button>
          )}
          {canEdit && tab === "profesores" && (
            <Button size="sm" onClick={() => setTeacherForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nuevo profesor
            </Button>
          )}
        </div>
      </header>

      {/* 021 — Un control segmentado en vez de cuatro píldoras sueltas: se ve
          que son opciones de LO MISMO, y la elegida se lee de lejos porque
          está levantada, no porque tenga otro color de relleno. */}
      <div className="border-b px-4 py-2.5 sm:px-6">
        <div className="inline-flex gap-1 rounded-lg bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-danger-border px-4 py-3">
            <p className="text-sm text-destructive">
              No se pudieron cargar todos los datos. Lo que ves abajo puede estar
              incompleto.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        )}

        {/* ------------------------------------------------ Grupos */}
        {!loading && tab === "grupos" && cohorts.length > 0 && (
          <TarjetaDeFiltros
            className="mb-5"
            pie={
              <ResumenDeFiltros
                mostrando={grupos.length}
                total={todasLasFilas.length}
                sustantivo={{ uno: "grupo", varios: "grupos" }}
                activos={filtrosActivosDeGrupos}
                onLimpiar={limpiarFiltrosDeGrupos}
              />
            }
          >
            <Buscador
              value={busquedaGrupos}
              onChange={setBusquedaGrupos}
              placeholder="Buscar grupo por nombre, curso o profesor…"
            />
            <SegmentadoDeEstado
              orden={ORDEN_DE_SECCION}
              etiquetas={ETIQUETA_DE_ESTADO}
              value={statusFilter}
              total={contadores.todas}
              conteos={contadores.estados}
              onTodos={() => setStatusFilter(new Set(STATUS_ORDER))}
              onAlternar={(e) => setStatusFilter(nextStatusFilter(statusFilter, e))}
            />
            {/* 032 (FR-011) — año: inicio o fin en él; se recuerda por navegador. */}
            <Desplegable
              etiqueta="Año"
              valor={etiquetaDeAnio(yearFilter)}
              activo={yearFilter !== TODOS_LOS_ANIOS}
            >
              {(cerrar) => (
                <>
                  <OpcionUnica
                    elegida={yearFilter === TODOS_LOS_ANIOS}
                    cantidad={contadores.todosLosAnios}
                    onElegir={() => {
                      elegirAnio(TODOS_LOS_ANIOS);
                      cerrar();
                    }}
                  >
                    Todos los años
                  </OpcionUnica>
                  {contadores.anios.map(({ anio, count }) => (
                    <OpcionUnica
                      key={anio}
                      elegida={yearFilter === anio}
                      cantidad={count}
                      onElegir={() => {
                        elegirAnio(anio);
                        cerrar();
                      }}
                    >
                      {anio === anioActual ? `Este año (${anio})` : anio}
                    </OpcionUnica>
                  ))}
                </>
              )}
            </Desplegable>
            {/* 032 (FR-013) — tipo: la madre o alguno de sus módulos. */}
            <Desplegable
              etiqueta="Tipo"
              valor={etiquetaDeTipos(cohortKindFilter)}
              activo={cohortKindFilter.size < COURSE_KINDS.length}
              alinear="derecha"
            >
              {() => (
                <>
                  {COURSE_KINDS.map((k) => (
                    <OpcionMarcable
                      key={k}
                      marcada={cohortKindFilter.has(k)}
                      cantidad={contadores.tipos[k]}
                      onAlternar={() => setCohortKindFilter(alternarTipo(cohortKindFilter, k))}
                    >
                      {COURSE_KIND_LABEL[k]}
                    </OpcionMarcable>
                  ))}
                  <OpcionAccion onClick={() => setCohortKindFilter(new Set(COURSE_KINDS))}>
                    Ver todos los tipos
                  </OpcionAccion>
                </>
              )}
            </Desplegable>
          </TarjetaDeFiltros>
        )}
        {!loading && tab === "grupos" &&
          (cohorts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium">Sin grupos todavía</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Creá un curso y después un grupo con costo, horario, aula,
                temario, software y profesor.
              </p>
            </div>
          ) : grupos.length === 0 ? (
            <SinCoincidencias
              mensaje="Ningún grupo coincide con la búsqueda y los filtros."
              onLimpiar={limpiarFiltrosDeGrupos}
            />
          ) : (
            <div className="space-y-5">
              {ORDEN_DE_SECCION.map((estado) => {
                const grupo = grupos.filter((g) => g.seccion === estado);
                if (grupo.length === 0) return null;
                const tono = TONO_DE_ESTADO[estado];
                return (
                  <section key={estado} aria-labelledby={`seccion-${estado}`}>
                    <EncabezadoDeSeccion
                      id={`seccion-${estado}`}
                      titulo={ETIQUETA_DE_ESTADO[estado]}
                      cantidad={grupo.length}
                      claseTexto={tono.texto}
                      clasePastilla={tono.pastilla}
                    />
                    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                      {grupo.map(({ cohort, modules, seccion }) => {
                        const abierta = desplegadas.has(cohort.id);
                        // Una especialización dicta por sus módulos: su
                        // progreso es la suma de los de ellos.
                        const progreso = cohort.isSpecialization
                          ? sumarProgresos([cohort.progress, ...modules.map((m) => m.cohort.progress)])
                          : (cohort.progress ?? null);
                        return (
                          <li key={cohort.id}>
                            {filaDeGrupo(cohort, {
                              titulo: cohort.name || cohort.courseName,
                              progreso,
                              estado: seccion,
                              modulos: cohort.isSpecialization
                                ? { cantidad: modules.length, abierta }
                                : undefined,
                            })}
                            {cohort.isSpecialization && abierta && (
                              <ul
                                id={`modulos-${cohort.id}`}
                                className="divide-y border-t bg-subtle pl-6"
                              >
                                {modules.length === 0 && (
                                  <li className="px-4 py-3 text-xs text-muted-foreground">
                                    Todavía no tiene módulos. Agregalos desde la
                                    pestaña Especialización del grupo.
                                  </li>
                                )}
                                {modules.map((m) => (
                                  <li key={m.cohort.id}>
                                    {filaDeGrupo(m.cohort, {
                                      titulo: m.label,
                                      progreso: m.cohort.progress ?? null,
                                    })}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          ))}

        {/* ------------------------------------------------ Cursos */}
        {!loading && tab === "cursos" && courses.length > 0 && (
          <TarjetaDeFiltros
            className="mb-5"
            pie={
              <ResumenDeFiltros
                mostrando={cursosVisibles.length}
                total={courses.length}
                sustantivo={{ uno: "curso", varios: "cursos" }}
                activos={filtrosActivosDeCursos}
                onLimpiar={limpiarFiltrosDeCursos}
              />
            }
          >
            <Buscador
              value={busquedaCursos}
              onChange={setBusquedaCursos}
              placeholder="Buscar curso por nombre…"
            />
            {/* 032 (FR-009) — arranca en "solo Curso". */}
            <Desplegable
              etiqueta="Tipo"
              valor={etiquetaDeTipos(courseKindFilter)}
              activo={courseKindFilter.size < COURSE_KINDS.length}
              alinear="derecha"
            >
              {() => (
                <>
                  {COURSE_KINDS.map((k) => (
                    <OpcionMarcable
                      key={k}
                      marcada={courseKindFilter.has(k)}
                      cantidad={cursosPorTipo[k]}
                      onAlternar={() => setCourseKindFilter(alternarTipo(courseKindFilter, k))}
                    >
                      {COURSE_KIND_LABEL[k]}
                    </OpcionMarcable>
                  ))}
                  <OpcionAccion onClick={() => setCourseKindFilter(new Set(COURSE_KINDS))}>
                    Ver todos los tipos
                  </OpcionAccion>
                </>
              )}
            </Desplegable>
          </TarjetaDeFiltros>
        )}
        {!loading && tab === "cursos" &&
          (courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cursos todavía.</p>
          ) : cursosVisibles.length === 0 ? (
            <SinCoincidencias
              mensaje="Ningún curso coincide con la búsqueda y los filtros."
              onLimpiar={limpiarFiltrosDeCursos}
            />
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {cursosVisibles.map((c) => {
                const categoria = c.categoryId
                  ? (categories.find((cat) => cat.id === c.categoryId)?.name ?? null)
                  : null;
                const subtitulo = [categoria, c.tagline ?? c.description]
                  .filter((p): p is string => Boolean(p))
                  .join(" · ");
                const siguen = rutas.get(c.id) ?? [];
                const cantidad = gruposPorCurso.get(c.id) ?? 0;
                const duracion = resumenDeDuracion(c);
                return (
                  <li
                    key={c.id}
                    className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-[11px] transition-colors hover:bg-subtle md:grid-cols-[38px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_auto]"
                  >
                    <AvatarDeCurso courseId={c.id} nombre={c.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-snug">
                        <Resaltado texto={c.name} busqueda={busquedaCursos} />
                      </p>
                      {subtitulo && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</p>
                      )}
                      {/* 046 (US2) — qué se le recomienda a quien lo cursó. */}
                      {siguen.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          Siguen: {siguen.map(courseNameFor).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="hidden min-w-0 text-[13px] text-text-2 md:block">
                      {duracion ?? <span className="text-muted-foreground">Sin duración cargada</span>}
                    </div>
                    <div className="hidden text-[13px] text-text-2 md:block">
                      {cantidad === 0 ? (
                        <span className="text-muted-foreground">Sin grupos</span>
                      ) : (
                        `${cantidad} ${cantidad === 1 ? "grupo" : "grupos"}`
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {/* 032 (FR-010) — cada curso dice qué es. */}
                      <EtiquetaDeTipo kind={c.kind} />
                      {canEdit && (
                        <>
                          {c.kind !== "taller" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Cursos siguientes de ${c.name}`}
                              title="Cursos siguientes"
                              onClick={() => setRutaDe(c)}
                            >
                              <Route className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </Button>
                          )}
                          {c.kind !== "taller" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Evaluaciones modelo de ${c.name}`}
                              title="Evaluaciones modelo"
                              onClick={() => setModelosDe(c)}
                            >
                              <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Editar ${c.name}`}
                            title="Editar"
                            onClick={() => setShowCourseForm({ mode: "edit", course: c })}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "profesores" && accesoProfesor && (
          <p className="mb-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
            {accesoProfesor}
          </p>
        )}
        {!loading && tab === "profesores" &&
          (teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin profesores todavía.</p>
          ) : (
            <ul className="space-y-2">
              {teachers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {t.hasPhoto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/teachers/${t.id}/photo`}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.email ?? ""}
                        {/* 040 (DV-009) — El costo solo viaja a quien puede verlo. */}
                        {t.hourlyRate === undefined
                          ? ""
                          : `${t.email ? " · " : ""}${
                              t.hourlyRate !== null ? `${formatCost(t.hourlyRate)}/hora` : "sin costo por hora"
                            }`}
                      </p>
                      {t.courseIds.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.courseIds.map((cid) => (
                            <Badge key={cid} variant="outline">
                              {courseNameFor(cid)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* 014 (T011, DV-006) — Acceso al portal, de a uno.
                        Sin correo se dice el MOTIVO en vez de ofrecer un botón
                        que devuelve 422: hoy los 7 profesores están así. */}
                    {!canManageAccess ? null : t.email ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={invitando === t.id}
                        onClick={() => void invitarProfesor(t.id)}
                      >
                        <KeyRound className="h-4 w-4" />
                        {invitando === t.id ? "Dando acceso…" : "Dar acceso"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Cargá su correo para poder invitarlo
                      </span>
                    )}
                    {/* 0090 — Todos los que ven Académico las miran; asignar es de
                        quien tiene `licencias.gestionar`. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Licencias de ${t.name}`}
                      onClick={() => setTeacherLicenses(t)}
                    >
                      Licencias
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTeacherForm({ mode: "edit", teacher: t })}
                        >
                          Editar
                        </Button>
                        {/* 014 (T008, DV-008) — La baja exige reasignar primero;
                            el servidor responde 409 con cuántas cohortes hay. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Dar de baja a ${t.name}`}
                          onClick={() => void bajaProfesor(t.id, t.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {/*
          023 — Las aulas traen su propio estado y su propia carga: no dependen
          de `refetch()` ni del `loading` de arriba, así que no se les aplica el
          esqueleto general.
        */}
        {tab === "aulas" && <RoomsPanel canEdit={canEdit} />}
      </div>

      {showCourseForm && (
        <CourseForm
          initial={showCourseForm.mode === "edit" ? showCourseForm.course : null}
          categories={categories}
          onClose={() => setShowCourseForm(null)}
          onSaved={() => {
            setShowCourseForm(null);
            void refetch();
          }}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
          onCategoryDeleted={(id) => {
            setCategories((prev) => prev.filter((c) => c.id !== id));
            void refetch();
          }}
          onDeleted={(id) => {
            setShowCourseForm(null);
            setCourses((prev) => prev.filter((c) => c.id !== id));
          }}
        />
      )}

      {rutaDe && (
        <NextCoursesDialog
          course={rutaDe}
          courses={courses}
          initial={rutas.get(rutaDe.id) ?? []}
          onClose={() => setRutaDe(null)}
          onSaved={(ids) => {
            setRutas((prev) => new Map(prev).set(rutaDe.id, ids));
            setRutaDe(null);
          }}
        />
      )}

      {modelosDe && (
        <AssessmentModelsDialog course={modelosDe} onClose={() => setModelosDe(null)} />
      )}

      {cohortForm && (
        <CohortForm
          courses={courses}
          teachers={teachers}
          software={software}
          /**
           * 028 fase 4 — Las camadas candidatas a ser padre. Se pasan las que
           * ya están cargadas en la pantalla: el formulario no las vuelve a
           * pedir, y quién puede ser padre de quién lo decide el servidor.
           */
          cohorts={cohorts}
          initial={cohortForm.mode === "edit" ? cohortForm.cohort : null}
          onClose={() => setCohortForm(null)}
          onSaved={() => {
            setCohortForm(null);
            void refetch();
          }}
          onTeacherCreated={(t) => setTeachers((prev) => [...prev, t])}
        />
      )}

      {teacherLicenses && (
        <TeacherLicensesDialog
          teacher={{ id: teacherLicenses.id, name: teacherLicenses.name, email: teacherLicenses.email }}
          canManage={canManageLicenses}
          onClose={() => setTeacherLicenses(null)}
        />
      )}

      {teacherForm && (
        <TeacherForm
          courses={courses}
          initial={teacherForm.mode === "edit" ? teacherForm.teacher : null}
          onClose={() => setTeacherForm(null)}
          onSaved={() => {
            setTeacherForm(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
