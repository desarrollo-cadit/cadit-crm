"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { CohortDto, CourseDto, SoftwareDto, TeacherDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CohortForm, CourseQuickForm } from "@/components/academic/cohort-form";
import { SoftwareForm } from "@/components/academic/software-form";
import { TeacherForm } from "@/components/academic/teacher-form";
import { Skeleton } from "../ui/skeleton";

const TABS = [
  { key: "courses", label: "Cursos" },
  { key: "cohorts", label: "Camadas" },
  { key: "software", label: "Software" },
  { key: "teachers", label: "Profesores" },
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

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatDaysOfWeek(daysOfWeek: string | null) {
  if (!daysOfWeek) return null;
  return daysOfWeek
    .split(",")
    .map((d) => DAY_LABELS[Number(d)])
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

/**
 * 005 (T014, US1) — pantalla de gestión académica. Iteración 2 (feedback en
 * vivo del dueño) suma pestañas Cursos/Software/Profesores: antes solo se
 * podían crear desde selectores dentro del formulario de camada, sin forma
 * de verlos listados ni editarlos fuera de ahí.
 */
export function AcademicClient() {
  const [tab, setTab] = useState<Tab>("courses");
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  const [teachers, setTeachers] = useState<TeacherDto[]>([]);
  const [software, setSoftware] = useState<SoftwareDto[]>([]);
  const [showCourseForm, setShowCourseForm] = useState<{ mode: "create" } | { mode: "edit"; course: CourseDto } | null>(null);
  const [cohortForm, setCohortForm] = useState<
    { mode: "create" } | { mode: "edit"; cohort: CohortDto } | null
  >(null);
  const [softwareForm, setSoftwareForm] = useState<
    { mode: "create" } | { mode: "edit"; software: SoftwareDto } | null
  >(null);
  const [teacherForm, setTeacherForm] = useState<
    { mode: "create" } | { mode: "edit"; teacher: TeacherDto } | null
  >(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [coursesRes, cohortsRes, teachersRes, softwareRes] = await Promise.all([
      fetch("/api/courses").catch(() => null),
      fetch("/api/cohorts").catch(() => null),
      fetch("/api/teachers").catch(() => null),
      fetch("/api/software").catch(() => null),
    ]);
    if (coursesRes?.ok) {
      const data = (await coursesRes.json()) as { courses: CourseDto[] };
      setCourses(data.courses);
    }
    if (cohortsRes?.ok) {
      const data = (await cohortsRes.json()) as { cohorts: CohortDto[] };
      setCohorts(data.cohorts);
    }
    if (teachersRes?.ok) {
      const data = (await teachersRes.json()) as { teachers: TeacherDto[] };
      setTeachers(data.teachers);
    }
    if (softwareRes?.ok) {
      const data = (await softwareRes.json()) as { software: SoftwareDto[] };
      setSoftware(data.software);
    }
    setLoading(false);
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
                <Plus className="h-4 w-4" /> Nueva camada
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

      <div className="flex gap-1.5 border-b px-6 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {!loading && tab === "cohorts" &&
          (cohorts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium">Sin camadas</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Creá un curso y después una camada con costo, horario, aula,
                temario, software y profesor.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cohorts.map((cohort) => (
                <li
                  key={cohort.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{cohort.name ?? cohort.courseName}</span>
                      <Badge variant={STATUS_BADGE[cohort.status].variant}>
                        {STATUS_BADGE[cohort.status].label}
                      </Badge>
                    </div>
                    {cohort.name && (
                      <p className="text-xs text-muted-foreground">{cohort.courseName}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(cohort.startDate)} → {formatDate(cohort.endDate)}
                      {" · "}
                      {cohort.teacher?.name ?? "sin profesor"}
                      {" · "}
                      {formatCost(cohort.cost)}
                      {cohort.classroom ? ` · Aula ${cohort.classroom}` : ""}
                    </p>
                    {(cohort.frequency || cohort.startTime || cohort.daysOfWeek) && (
                      <p className="text-xs text-muted-foreground">
                        {formatDaysOfWeek(cohort.daysOfWeek) ?? cohort.frequency}
                        {cohort.startTime
                          ? ` ${formatDaysOfWeek(cohort.daysOfWeek) ?? cohort.frequency ? "· " : ""}${cohort.startTime}${cohort.endTime ? `–${cohort.endTime}` : ""}`
                          : ""}
                      </p>
                    )}
                    {cohort.software.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
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
                      <Button variant="ghost" size="sm">
                        Ver camada
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCohortForm({ mode: "edit", cohort })}
                    >
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
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
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                    )}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTeacherForm({ mode: "edit", teacher: t })}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {showCourseForm && (
        <CourseQuickForm
          initial={showCourseForm.mode === "edit" ? showCourseForm.course : null}
          onClose={() => setShowCourseForm(null)}
          onSaved={() => {
            setShowCourseForm(null);
            void refetch();
          }}
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
