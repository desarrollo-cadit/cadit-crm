"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  KeyRound,
  MapPin,
  Plus,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import type {
  CohortDto,
  CourseCategoryDto,
  CourseDto,
  SoftwareDto,
  TeacherDto,
} from "@/lib/types";
import { WEEKDAY_LABELS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CohortForm } from "@/components/academic/cohort-form";
import { CourseForm } from "@/components/academic/course-form";
import { SoftwareForm } from "@/components/academic/software-form";
import { TeacherForm } from "@/components/academic/teacher-form";
import { RoomsPanel } from "@/components/academic/rooms-panel";

const TABS = [
  { key: "courses", label: "Cursos" },
  { key: "cohorts", label: "Cohortes" },
  { key: "software", label: "Software" },
  { key: "teachers", label: "Profesores" },
  // 023 — Las salas de reunión. Van acá y no en Configuración porque se tocan
  // armando el cronograma, no una vez al instalar.
  { key: "rooms", label: "Aulas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCost(cost: number | null) {
  if (cost === null) return "—";
  return `$${cost.toLocaleString("es-MX")}`;
}

function formatDaysOfWeek(daysOfWeek: string | null) {
  if (!daysOfWeek) return null;
  return daysOfWeek
    .split(",")
    .map((d) => WEEKDAY_LABELS[Number(d)])
    .join(", ");
}

/**
 * 005 iteración 4 (feedback en vivo: "debería ser automático... que muestre
 * distintas badges") — el status ya se calcula solo en el servidor
 * (computeCohortStatus); acá solo se mapea a color + etiqueta.
 */
const STATUS_BADGE: Record<
  CohortDto["status"],
  { label: string; variant: "warning" | "success" | "outline" }
> = {
  planificada: { label: "Planificada", variant: "warning" },
  en_curso: { label: "En curso", variant: "success" },
  finalizada: { label: "Finalizada", variant: "outline" },
};

const STATUS_ORDER: CohortDto["status"][] = ["planificada", "en_curso", "finalizada"];

/**
 * 021 — Una pieza de dato con su ícono.
 *
 * Existe para que la ficha de una cohorte se ESCANEE en vez de leerse: cinco
 * datos separados por puntos medios obligan a recorrer la oración entera para
 * encontrar el aula.
 */
function Dato({
  icono,
  children,
  alerta,
}: {
  icono: React.ReactNode;
  children: React.ReactNode;
  /** Lo que FALTA se pinta distinto: no es un dato más, es una tarea. */
  alerta?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${alerta ? "text-warning" : ""}`}
    >
      {icono}
      <span className="truncate">{children}</span>
    </span>
  );
}

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
 */
export function nextStatusFilter(
  current: ReadonlySet<CohortDto["status"]>,
  clicked: CohortDto["status"],
  all: readonly CohortDto["status"][] = STATUS_ORDER
): Set<CohortDto["status"]> {
  if (current.size === all.length) return new Set([clicked]);
  const next = new Set(current);
  if (next.has(clicked)) next.delete(clicked);
  else next.add(clicked);
  return next.size === 0 ? new Set(all) : next;
}

/**
 * 007 (feedback en vivo: "deberíamos poder filtrar por todos, cursos
 * planificados, en curso y finalizados... que se pueda elegir cuáles
 * mostrar") — filtro por estado, de selección MÚLTIPLE: con 41 cohortes
 * cargadas, la lista completa es casi toda archivo, y lo que se quiere ver
 * día a día es planificadas + en curso.
 *
 * Cada chip lleva su conteo: así se ve cuántas hay de cada estado sin tener
 * que activarlo para descubrirlo.
 */
function CohortStatusFilter({
  cohorts,
  value,
  onChange,
}: {
  cohorts: CohortDto[];
  value: Set<CohortDto["status"]>;
  onChange: (next: Set<CohortDto["status"]>) => void;
}) {
  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    count: cohorts.filter((c) => c.status === s).length,
  }));
  const allOn = value.size === STATUS_ORDER.length;

  const toggle = (status: CohortDto["status"]) =>
    onChange(nextStatusFilter(value, status));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Mostrar:</span>
      <button
        type="button"
        aria-pressed={allOn}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          allOn ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
        }`}
        onClick={() => onChange(new Set(STATUS_ORDER))}
      >
        Todas ({cohorts.length})
      </button>
      {counts.map(({ status, count }) => (
        // El chip se pinta según su estado REAL. Antes se apagaba cuando
        // estaban las tres activas, así que se veía apagado estando
        // encendido: al tocarlo hacía lo contrario de lo que parecía.
        <button
          key={status}
          type="button"
          aria-pressed={value.has(status)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            value.has(status)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          }`}
          onClick={() => toggle(status)}
        >
          {STATUS_BADGE[status].label} ({count})
        </button>
      ))}
    </div>
  );
}

/**
 * 005 (T014, US1) — pantalla de gestión académica. Iteración 2 (feedback en
 * vivo del dueño) suma pestañas Cursos/Software/Profesores: antes solo se
 * podían crear desde selectores dentro del formulario de cohorte, sin forma
 * de verlos listados ni editarlos fuera de ahí.
 */
export function AcademicClient() {
  const [tab, setTab] = useState<Tab>("courses");
  /**
   * 007 (feedback en vivo: "deberíamos poder filtrar por todos, cursos
   * planificados, en curso y finalizados") — filtro por estado de la cohorte.
   * Es un conjunto y no un valor único porque el caso más pedido es ver dos
   * a la vez (planificadas + en curso) y esconder el archivo de finalizadas.
   * Arranca con los tres marcados: el comportamiento de antes.
   */
  const [statusFilter, setStatusFilter] = useState<Set<CohortDto["status"]>>(
    new Set(["planificada", "en_curso", "finalizada"])
  );
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  const [teachers, setTeachers] = useState<TeacherDto[]>([]);
  const [software, setSoftware] = useState<SoftwareDto[]>([]);
  const [categories, setCategories] = useState<CourseCategoryDto[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState<
    { mode: "create" } | { mode: "edit"; course: CourseDto } | null
  >(null);
  const [cohortForm, setCohortForm] = useState<
    { mode: "create" } | { mode: "edit"; cohort: CohortDto } | null
  >(null);
  const [softwareForm, setSoftwareForm] = useState<
    { mode: "create" } | { mode: "edit"; software: SoftwareDto } | null
  >(null);
  /** 014 — Invitación al portal y baja del profesor. */
  const [invitando, setInvitando] = useState<string | null>(null);
  /** 023 — Qué cohorte se está borrando, y qué contestó el servidor. */
  const [borrando, setBorrando] = useState<string | null>(null);
  const [avisoCohorte, setAvisoCohorte] = useState<string | null>(null);
  const [avisoProfesor, setAvisoProfesor] = useState<string | null>(null);

  /**
   * 014 (T011) — Da acceso al portal a UN profesor.
   *
   * La contraseña temporal se muestra una sola vez, igual que con los alumnos:
   * sirve para dictarla si el correo demora, y no se puede volver a consultar.
   */
  /**
   * 023 — Borra una cohorte creada por error.
   *
   * **La regla vive en el servidor**, no acá: con inscripciones, clases,
   * asistencia, evaluaciones o pagos responde 409 y dice qué la ata. El
   * navegador solo muestra ese mensaje. Duplicar la regla en la pantalla es
   * cómo las dos se desincronizan y una termina ofreciendo lo que la otra
   * rechaza.
   *
   * La confirmación es del navegador a propósito: un diálogo propio para una
   * acción que el servidor ya puede rechazar es ceremonia sobre ceremonia.
   */
  async function borrarCohorte(cohort: CohortDto) {
    const nombre = cohort.name ?? cohort.courseName;
    if (!confirm(`¿Borrar "${nombre}"? Si tiene inscripciones o clases, no se va a poder.`)) {
      return;
    }

    setBorrando(cohort.id);
    setAvisoCohorte(null);
    const res = await fetch(`/api/cohorts/${cohort.id}`, { method: "DELETE" }).catch(
      () => null
    );
    setBorrando(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setAvisoCohorte(body?.error?.message ?? "No se pudo borrar la cohorte.");
      return;
    }

    setCohorts((prev) => prev.filter((c) => c.id !== cohort.id));
  }

  async function invitarProfesor(teacherId: string) {
    setInvitando(teacherId);
    setAvisoProfesor(null);
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
      setAvisoProfesor(data?.error?.message ?? "No se pudo dar el acceso");
      return;
    }

    if (!data?.temporaryPassword) {
      setAvisoProfesor(
        "Esa persona ya tenía cuenta; se le habilitó el portal y entra con su contraseña de siempre."
      );
      return;
    }

    /**
     * 014 — El correo puede no haber salido, y decir que salió sería mentir
     * sobre lo único que la persona necesita para entrar. El acceso se creó
     * igual: la contraseña está acá y hay que dictarla.
     */
    setAvisoProfesor(
      data.emailError
        ? `Acceso creado, pero el correo NO salió (${data.emailError}) — dictale vos la contraseña: ${data.temporaryPassword}. No se puede volver a ver.`
        : `Acceso creado. Contraseña temporal: ${data.temporaryPassword} — ya se la mandamos por correo, no se puede volver a ver.`
    );
  }

  /**
   * 014 (T008, DV-008) — Baja del profesor.
   *
   * El servidor decide: con cohortes asignadas responde 409 diciendo cuántas.
   * El navegador solo muestra ese mensaje — la barrera no vive acá.
   */
  async function bajaProfesor(teacherId: string, nombre: string) {
    setAvisoProfesor(null);
    const res = await fetch(`/api/teachers/${teacherId}`, {
      method: "DELETE",
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; cohorts?: number }
      | null;

    if (!res?.ok) {
      setAvisoProfesor(data?.error?.message ?? "No se pudo dar de baja");
      return;
    }
    setAvisoProfesor(`${nombre} fue dado de baja.`);
    void refetch();
  }

  const [teacherForm, setTeacherForm] = useState<
    { mode: "create" } | { mode: "edit"; teacher: TeacherDto } | null
  >(null);

  const visibleCohorts = cohorts.filter((c) => statusFilter.has(c.status));

  /**
   * Cada recurso se lee por separado y un fallo NO se traga en silencio: si
   * alguno falla, se marca `loadError`, porque una lista vacía por un 500 es
   * indistinguible de una organización sin datos. `setLoading(false)` va en
   * `finally` — un body malformado tiraba dentro del callback y dejaba el
   * esqueleto de carga para siempre.
   */
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold">Gestión académica</h2>
        <div className="flex items-center gap-2">
          {tab === "cohorts" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowCourseForm({ mode: "create" })}>
                <Plus className="h-4 w-4" /> Nuevo curso
              </Button>
              <Button
                size="sm"
                disabled={courses.length === 0}
                onClick={() => setCohortForm({ mode: "create" })}
              >
                <Plus className="h-4 w-4" /> Nueva cohorte
              </Button>
            </>
          )}
          {tab === "courses" && (
            <Button size="sm" onClick={() => setShowCourseForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nuevo curso
            </Button>
          )}
          {tab === "software" && (
            <Button size="sm" onClick={() => setSoftwareForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nuevo software
            </Button>
          )}
          {tab === "teachers" && (
            <Button size="sm" onClick={() => setTeacherForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nuevo profesor
            </Button>
          )}
        </div>
      </header>

      {/* 021 — Un control segmentado en vez de cuatro píldoras sueltas: se ve
          que son opciones de LO MISMO, y la elegida se lee de lejos porque
          está levantada, no porque tenga otro color de relleno. */}
      <div className="border-b px-6 py-2.5">
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

      <div className="flex-1 overflow-y-auto p-6">
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
        {tab === "cohorts" && avisoCohorte && (
          <p className="mb-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
            {avisoCohorte}
          </p>
        )}
        {!loading && tab === "cohorts" && cohorts.length > 0 && (
          <CohortStatusFilter
            cohorts={cohorts}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        )}
        {!loading && tab === "cohorts" &&
          (cohorts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium">Sin cohorte</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Creá un curso y después una cohorte con costo, horario, aula,
                temario, software y profesor.
              </p>
            </div>
          ) : visibleCohorts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Ninguna cohorte coincide con el filtro.
            </p>
          ) : (
            /**
             * 021 — La tarjeta de cohorte, rediseñada.
             *
             * Tenía CUATRO párrafos apilados, todos en `text-xs
             * text-muted-foreground`: la fecha, el profesor, el costo, el aula
             * y el horario pesaban exactamente lo mismo, así que la lista se
             * leía como un bloque de texto gris y había que leerla entera para
             * encontrar cualquier cosa. Con 41 cohortes eso es inservible.
             *
             * Ahora: el CURSO manda (es por lo que se busca), la edición va
             * abajo, y los datos se separan en piezas con ícono — se escanean
             * en vez de leerse.
             *
             * Se probó una franja de color a la izquierda para el estado y se
             * descartó: un borde de color de más de 1px en una tarjeta es
             * decoración, y el estado YA lo dice el badge.
             */
            /**
             * 021 — Agrupada por estado.
             *
             * Con 41 cohortes, una lista plana obliga a leerla entera para
             * saber cuáles están cursando HOY — que es la única pregunta que
             * se hace todos los días. El filtro de arriba sigue estando para
             * esconder grupos; esto ORDENA lo que quedó.
             *
             * Es estructura, no color: lo que ayuda a recorrer 41 elementos no
             * es pintarlos, es agruparlos.
             */
            <div className="space-y-6">
              {(["en_curso", "planificada", "finalizada"] as const).map((estado) => {
                const grupo = visibleCohorts.filter((c) => c.status === estado);
                if (grupo.length === 0) return null;
                return (
                  <section key={estado} className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {STATUS_BADGE[estado].label} ({grupo.length})
                    </h3>
                    <ul className="space-y-2.5">
              {grupo.map((cohort) => (
                <li
                  key={cohort.id}
                  className="rounded-lg border bg-card transition-colors hover:border-brand-soft"
                >
                  <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/cohorts/${cohort.id}`}
                          className="text-[15px] font-semibold leading-tight hover:underline"
                        >
                          {cohort.courseName}
                        </Link>
                        <Badge variant={STATUS_BADGE[cohort.status].variant}>
                          {STATUS_BADGE[cohort.status].label}
                        </Badge>
                      </div>
                      {cohort.name && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {cohort.name}
                        </p>
                      )}

                      {/* Piezas, no una oración con puntos medios. */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <Dato icono={<CalendarDays className="h-3.5 w-3.5" />}>
                          {formatDate(cohort.startDate)} → {formatDate(cohort.endDate)}
                        </Dato>
                        {(cohort.daysOfWeek || cohort.frequency || cohort.startTime) && (
                          <Dato icono={<Clock className="h-3.5 w-3.5" />}>
                            {formatDaysOfWeek(cohort.daysOfWeek) ?? cohort.frequency}
                            {cohort.startTime && (
                              <>
                                {" "}
                                {cohort.startTime}
                                {cohort.endTime && `–${cohort.endTime}`}
                              </>
                            )}
                          </Dato>
                        )}
                        <Dato
                          icono={<UserRound className="h-3.5 w-3.5" />}
                          /* Sin profesor no es un dato más: es algo que
                             falta, y hoy le pasa a 8 de las 41. */
                          alerta={!cohort.teacher}
                        >
                          {cohort.teacher?.name ?? "sin profesor"}
                        </Dato>
                        {cohort.classroom && (
                          <Dato icono={<MapPin className="h-3.5 w-3.5" />}>
                            {cohort.classroom}
                          </Dato>
                        )}
                        <Dato icono={<Wallet className="h-3.5 w-3.5" />}>
                          {formatCost(cohort.cost)}
                        </Dato>
                      </div>

                      {cohort.software.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cohort.software.map((s) => (
                            <Badge key={s.id} variant="outline">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Link href={`/cohorts/${cohort.id}`}>
                        <Button variant="outline" size="sm">
                          Ver cohorte
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCohortForm({ mode: "edit", cohort })}
                      >
                        Editar
                      </Button>
                      {/*
                        023 — Borrar una cohorte creada por error. El servidor
                        decide: con inscripciones, clases, asistencia,
                        evaluaciones o pagos responde 409 y dice QUÉ la ata.
                        Acá no hay ninguna regla — mostrar el botón solo
                        cuando "parece" borrable sería una segunda regla que
                        se desincroniza con la del servidor.
                      */}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Borrar ${cohort.name ?? cohort.courseName}`}
                        title="Borrar"
                        loading={borrando === cohort.id}
                        onClick={() => void borrarCohorte(cohort)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ))}

        {!loading && tab === "courses" &&
          (courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cursos todavía.</p>
          ) : (
            <ul className="space-y-2">
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.categoryId && (
                        <Badge variant="secondary">
                          {categories.find((cat) => cat.id === c.categoryId)?.name ??
                            "Categoría"}
                        </Badge>
                      )}
                    </div>
                    {(c.tagline ?? c.description) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.tagline ?? c.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">/cursos/{c.slug}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCourseForm({ mode: "edit", course: c })}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {!loading && tab === "software" &&
          (software.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin software cargado todavía.</p>
          ) : (
            <ul className="space-y-2">
              {software.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {s.hasPhoto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/software/${s.id}/photo`}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.totalLicenses} licencia{s.totalLicenses === 1 ? "" : "s"} en total
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSoftwareForm({ mode: "edit", software: s })}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {tab === "teachers" && avisoProfesor && (
          <p className="mb-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
            {avisoProfesor}
          </p>
        )}
        {!loading && tab === "teachers" &&
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
                        {t.email ? `${t.email} · ` : ""}
                        {t.hourlyRate !== null ? `${formatCost(t.hourlyRate)}/hora` : "sin costo por hora"}
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
                    {t.email ? (
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
        {tab === "rooms" && <RoomsPanel />}
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
        />
      )}

      {cohortForm && (
        <CohortForm
          courses={courses}
          teachers={teachers}
          software={software}
          initial={cohortForm.mode === "edit" ? cohortForm.cohort : null}
          onClose={() => setCohortForm(null)}
          onSaved={() => {
            setCohortForm(null);
            void refetch();
          }}
          onTeacherCreated={(t) => setTeachers((prev) => [...prev, t])}
        />
      )}

      {softwareForm && (
        <SoftwareForm
          initial={softwareForm.mode === "edit" ? softwareForm.software : null}
          onClose={() => setSoftwareForm(null)}
          onSaved={() => {
            setSoftwareForm(null);
            void refetch();
          }}
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
