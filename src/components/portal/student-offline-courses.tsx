"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  Library,
  ListChecks,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/offline-courses/markdown";
import { VimeoPlayer, type VimeoProgressReport } from "@/components/offline-courses/vimeo-player";
import { EmptyNote, PortalCard, SectionTitle } from "@/components/portal/student-bits";
import type {
  StudentOfflineCourse,
  StudentOfflineCourseCard,
  StudentOfflineTopic,
  StudentQuizSummary,
} from "@/server/offline-courses/student";

/**
 * cursos-offline (T5) — The offline library in the student portal: the list,
 * one course (lessons → topics + quizzes) and one topic.
 *
 * Everything comes from `/api/portal/me/offline-courses`, which answers only
 * for courses this person can read; a 404 here means "not yours or not
 * there", and the screen says the same for both.
 *
 * T9 — Topics open in order: the server answers 404 for a locked topic, and
 * the course page shows it with a lock instead of a link. A topic completes
 * when its video is really watched (≥ 90%, reported by the player) or, if it
 * has no video, when it is opened. A course is finished when every topic is
 * complete and every quiz passed.
 */

export const OFFLINE_BASE = "/portal/cursos-offline";
const API_BASE = "/api/portal/me/offline-courses";

/* ============================================================
 * Fetching
 * ============================================================ */

type Load<T> =
  | { state: "loading" }
  | { state: "ok"; data: T }
  | { state: "not_found" }
  | { state: "error" };

/**
 * GET + the three honest outcomes: data, "not found" and "could not load".
 * `T` is the JSON body as the route declares it.
 */
export function usePortalJson<T>(url: string) {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });

  const refetch = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.status === 404) return setLoad({ state: "not_found" });
    if (!res?.ok) return setLoad({ state: "error" });
    setLoad({ state: "ok", data: (await res.json()) as T });
  }, [url]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { load, refetch };
}

export function LoadFallback({ load, notFound }: { load: Load<unknown>; notFound: string }) {
  if (load.state === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (load.state === "not_found") {
    return (
      <EmptyNote title={notFound}>
        Puede que el curso ya no esté asignado. Si creés que es un error, consultá con la academia.
      </EmptyNote>
    );
  }
  return (
    <PortalCard className="border-danger-border bg-danger-soft">
      <p className="text-sm text-danger">
        No se pudo cargar la información. Probá de nuevo en un momento.
      </p>
    </PortalCard>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
      {children}
    </Link>
  );
}

/* ============================================================
 * Quiz status
 * ============================================================ */

export function QuizStatusBadge({ quiz }: { quiz: Pick<StudentQuizSummary, "status" | "attemptsRemaining"> }) {
  if (quiz.status === "aprobado") return <Badge variant="success">Aprobado</Badge>;
  if (quiz.status === "sin_intentos") return <Badge variant="destructive">Sin intentos</Badge>;
  if (quiz.attemptsRemaining === null) return <Badge variant="secondary">Intentos ilimitados</Badge>;
  return (
    <Badge variant="warning">
      {quiz.attemptsRemaining === 1
        ? "1 intento restante"
        : `${quiz.attemptsRemaining} intentos restantes`}
    </Badge>
  );
}

/* ============================================================
 * The list
 * ============================================================ */

export function StudentOfflineCoursesClient() {
  const { load } = usePortalJson<{ courses: StudentOfflineCourseCard[] }>(API_BASE);

  if (load.state !== "ok") return <LoadFallback load={load} notFound="No se encontraron cursos" />;

  if (load.data.courses.length === 0) {
    return (
      <EmptyNote title="Todavía no tenés cursos offline asignados">
        Cuando la academia asigne un curso a tu grupo, aparecerá acá con sus guías y cuestionarios.
      </EmptyNote>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {load.data.courses.map((c) => (
        <li key={c.id}>
          <Link
            href={`${OFFLINE_BASE}/${c.id}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-accent"
          >
            {c.hasThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_BASE}/${c.id}/thumbnail`}
                alt=""
                className="aspect-video w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                aria-hidden
                className="flex aspect-video w-full items-center justify-center bg-brand-tint text-brand-text"
              >
                <Library className="h-8 w-8" strokeWidth={1.6} />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-3 p-[var(--portal-card-pad)]">
              <p className="text-sm font-semibold">{c.title}</p>
              <CourseProgress card={c} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CourseProgress({ card }: { card: StudentOfflineCourseCard }) {
  const { completion } = card;
  return (
    <div className="mt-auto space-y-1.5">
      <CompletionLine completion={completion} />
      <CompletionBar completion={completion} />
    </div>
  );
}

type Completion = StudentOfflineCourse["completion"];

/** "3 de 10 temas · 1 de 2 cuestionarios" + the finished badge. */
function CompletionLine({ completion }: { completion: Completion }) {
  const temas = `${completion.topicsDone} de ${completion.topicsTotal} ${
    completion.topicsTotal === 1 ? "tema" : "temas"
  }`;
  const cuestionarios =
    completion.quizzesTotal === 0
      ? "sin cuestionarios"
      : `${completion.quizzesPassed} de ${completion.quizzesTotal} ${
          completion.quizzesTotal === 1 ? "cuestionario aprobado" : "cuestionarios aprobados"
        }`;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-text-3">
      <span>
        {temas} · {cuestionarios}
      </span>
      {completion.completed && <Badge variant="success">Curso terminado</Badge>}
    </p>
  );
}

/** Topics and quizzes weigh the same: each is one thing left to do. */
function CompletionBar({ completion }: { completion: Completion }) {
  const total = completion.topicsTotal + completion.quizzesTotal;
  const done = completion.topicsDone + completion.quizzesPassed;
  return (
    <Progress
      value={total === 0 ? 0 : (done / total) * 100}
      tone={completion.completed ? "success" : "brand"}
      label={`Avance del curso: ${done} de ${total}`}
    />
  );
}

/* ============================================================
 * One course
 * ============================================================ */

export function StudentOfflineCourseClient({ courseId }: { courseId: string }) {
  const { load } = usePortalJson<{ course: StudentOfflineCourse }>(`${API_BASE}/${courseId}`);

  return (
    <div className="space-y-5">
      <BackLink href={OFFLINE_BASE}>Cursos offline</BackLink>
      {load.state !== "ok" ? (
        <LoadFallback load={load} notFound="Curso no encontrado" />
      ) : (
        <CourseBody course={load.data.course} />
      )}
    </div>
  );
}

function CourseBody({ course }: { course: StudentOfflineCourse }) {
  const base = `${OFFLINE_BASE}/${course.id}`;
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
        {course.descriptionMd && (
          <Markdown source={course.descriptionMd} className="mt-2 text-muted-foreground" />
        )}
      </div>

      <PortalCard className="space-y-2">
        <CompletionLine completion={course.completion} />
        <CompletionBar completion={course.completion} />
        {!course.completion.completed && (
          <p className="text-xs text-text-3">
            Los temas se abren en orden: cada uno se habilita al terminar el anterior. Los
            cuestionarios los podés hacer cuando quieras.
          </p>
        )}
      </PortalCard>

      <section className="space-y-3">
        <SectionTitle>Contenido</SectionTitle>
        {course.lessons.length === 0 ? (
          <EmptyNote title="Este curso no tiene lecciones cargadas" />
        ) : (
          course.lessons.map((lesson) => (
            <PortalCard key={lesson.id} className="space-y-2">
              <h2 className="text-sm font-semibold">{lesson.title}</h2>
              {lesson.topics.length === 0 ? (
                <p className="text-xs text-text-3">Sin temas</p>
              ) : (
                <ol className="divide-y divide-border">
                  {lesson.topics.map((t) => (
                    <li key={t.id}>
                      {t.unlocked ? (
                        <Link
                          href={`${base}/temas/${t.id}`}
                          className="flex min-h-[44px] items-center gap-2 py-2 text-sm transition-colors hover:text-brand-text"
                        >
                          {t.completed ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-success"
                              strokeWidth={1.7}
                              aria-label="Completado"
                            />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
                          )}
                          <span className="flex-1">{t.title}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-text-3" />
                        </Link>
                      ) : (
                        <span
                          className="flex min-h-[44px] items-center gap-2 py-2 text-sm text-text-3"
                          title="Se habilita al terminar el tema anterior"
                        >
                          <Lock className="h-4 w-4 shrink-0" strokeWidth={1.7} aria-label="Bloqueado" />
                          <span className="flex-1">{t.title}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </PortalCard>
          ))
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Cuestionarios</SectionTitle>
        {course.quizzes.length === 0 ? (
          <EmptyNote title="Este curso no tiene cuestionarios" />
        ) : (
          <PortalCard>
            <ul className="divide-y divide-border">
              {course.quizzes.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`${base}/cuestionarios/${q.id}`}
                    className="flex min-h-[44px] flex-wrap items-center gap-2 py-2 text-sm transition-colors hover:text-brand-text"
                  >
                    <ListChecks className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
                    <span className="flex-1">{q.title}</span>
                    <QuizStatusBadge quiz={q} />
                  </Link>
                </li>
              ))}
            </ul>
          </PortalCard>
        )}
      </section>
    </>
  );
}

/* ============================================================
 * One topic
 * ============================================================ */

export function StudentOfflineTopicClient({
  courseId,
  topicId,
}: {
  courseId: string;
  topicId: string;
}) {
  const { load } = usePortalJson<{ topic: StudentOfflineTopic }>(
    `${API_BASE}/${courseId}/topics/${topicId}`
  );
  const base = `${OFFLINE_BASE}/${courseId}`;

  if (load.state !== "ok") {
    return (
      <div className="space-y-5">
        <BackLink href={base}>Volver al curso</BackLink>
        <LoadFallback load={load} notFound="Tema no encontrado" />
      </div>
    );
  }
  // Keyed by topic: moving to the next topic starts its progress from scratch.
  return <TopicBody key={topicId} data={load.data.topic} courseId={courseId} />;
}

type SaveState = "idle" | "saving" | "error";

function TopicBody({ data, courseId }: { data: StudentOfflineTopic; courseId: string }) {
  const { course, lessonTitle, topic, video, prev, next } = data;
  const base = `${OFFLINE_BASE}/${courseId}`;
  const progressUrl = `${API_BASE}/${courseId}/topics/${topic.id}/progress`;
  const [progress, setProgress] = useState(data.progress);
  const [save, setSave] = useState<SaveState>("idle");

  const send = useCallback(
    async (body: VimeoProgressReport | { noVideo: true }) => {
      setSave("saving");
      const res = await fetch(progressUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        // The player also reports while the page is being left.
        keepalive: true,
      }).catch(() => null);
      if (!res?.ok) return setSave("error");
      const json = (await res.json()) as {
        progress: { watchedRatio: number; completed: boolean };
      };
      setProgress((p) => ({
        completed: p.completed || json.progress.completed,
        watchedRatio: Math.max(p.watchedRatio, json.progress.watchedRatio),
      }));
      setSave("idle");
    },
    [progressUrl]
  );

  // A topic without a video completes on open — once per visit.
  const sentNoVideo = useRef(false);
  useEffect(() => {
    if (video || progress.completed || sentNoVideo.current) return;
    sentNoVideo.current = true;
    void send({ noVideo: true });
  }, [video, progress.completed, send]);

  const player = video ? (
    <PortalCard className="space-y-2">
      <VimeoPlayer video={video} title={`Video: ${topic.title}`} onProgress={send} />
      <p className="text-xs text-text-3">
        {progress.completed
          ? "Video completado."
          : `Visto: ${Math.floor(progress.watchedRatio * 100)}%. El tema se completa al ver al menos el 90%.`}
      </p>
    </PortalCard>
  ) : null;

  return (
    <article className="space-y-5">
      <BackLink href={base}>{course.title}</BackLink>
      <header className="space-y-1">
        {lessonTitle && <p className="text-xs font-medium text-text-3">{lessonTitle}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
          {progress.completed && <Badge variant="success">Tema completado</Badge>}
        </div>
      </header>

      {video?.shown === "before" && player}

      <PortalCard>
        {topic.contentMd.trim() ? (
          <Markdown source={topic.contentMd} />
        ) : (
          <p className="text-sm text-text-3">Este tema no tiene contenido escrito.</p>
        )}
      </PortalCard>

      {video?.shown === "after" && player}

      {save === "error" && (
        <p role="alert" className="text-sm text-danger">
          No se pudo registrar tu avance. Revisá tu conexión y recargá la página.
        </p>
      )}

      <nav aria-label="Temas" className="flex flex-wrap items-start justify-between gap-3">
        {prev ? (
          <Link
            href={`${base}/temas/${prev.id}`}
            className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-md border border-input px-4 text-sm transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          progress.completed ? (
            <Link
              href={`${base}/temas/${next.id}`}
              className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-md border border-input px-4 text-sm transition-colors hover:bg-accent"
            >
              <span className="truncate">Siguiente tema: {next.title}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <div className="flex max-w-full flex-col items-end gap-1">
              <button
                type="button"
                disabled
                aria-describedby="siguiente-bloqueado"
                className="inline-flex min-h-[44px] max-w-full cursor-not-allowed items-center gap-2 rounded-md border border-input px-4 text-sm text-text-3"
              >
                <Lock className="h-4 w-4 shrink-0" strokeWidth={1.7} />
                <span className="truncate">Siguiente tema</span>
              </button>
              <p id="siguiente-bloqueado" className="text-right text-xs text-text-3">
                {video
                  ? "Se habilita cuando veas al menos el 90% del video."
                  : "Registrando tu avance…"}
              </p>
            </div>
          )
        ) : (
          <Link
            href={base}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-input px-4 text-sm transition-colors hover:bg-accent"
          >
            Volver al curso
          </Link>
        )}
      </nav>
    </article>
  );
}
