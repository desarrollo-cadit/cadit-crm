import { notFound, redirect } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { courseDetail } from "@/server/offline-courses/library";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Markdown } from "@/components/offline-courses/markdown";
import { OfflineCourseStatusBadge } from "@/components/offline-courses/status-badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * cursos-offline (T4) — One library course, read-only.
 *
 * Staff view: the quizzes show which answers are correct. That is exactly
 * what the student portal must never show, so this page and its query are
 * staff-only and T5 does not reuse them.
 *
 * Lessons and topics fold (`<details>`): a course brings ~40 topics, and a
 * wall of text is not a way to find one.
 */
export default async function OfflineCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("academico.ver")) redirect("/");

  const course = await withTenantTransaction(session, () =>
    courseDetail(session.organizationId, id)
  );
  if (!course) notFound();

  const lessonTitle = new Map(course.lessons.map((l) => [l.id, l.title]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-2">
          <Breadcrumb
            items={[
              { label: "Cursos offline", href: "/cursos-offline" },
              { label: course.title, href: null },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{course.title}</h2>
            <OfflineCourseStatusBadge status={course.status} />
          </div>
          <Markdown source={course.descriptionMd} className="text-muted-foreground" />
        </header>

        <section aria-labelledby="lecciones" className="space-y-3">
          <h3 id="lecciones" className="text-sm font-semibold">
            Lecciones
          </h3>
          {course.lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este curso no tiene lecciones.</p>
          ) : (
            <ol className="space-y-2">
              {course.lessons.map((lesson, i) => (
                <li key={lesson.id}>
                  <details className="rounded-lg border bg-card">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      {i + 1}. {lesson.title}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({plural(lesson.topics.length, "tema", "temas")})
                      </span>
                    </summary>
                    <div className="space-y-3 border-t px-4 py-3">
                      <Markdown source={lesson.contentMd} />
                      {lesson.topics.map((topic) => (
                        <details key={topic.id} className="rounded-md border bg-subtle">
                          <summary className="cursor-pointer px-3 py-2 text-sm">
                            {topic.title}
                          </summary>
                          <div className="border-t px-3 py-3">
                            {topic.contentMd.trim() ? (
                              <Markdown source={topic.contentMd} />
                            ) : (
                              <p className="text-sm text-muted-foreground">Sin contenido.</p>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="cuestionarios" className="space-y-3">
          <h3 id="cuestionarios" className="text-sm font-semibold">
            Cuestionarios
          </h3>
          {course.quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este curso no tiene cuestionarios.</p>
          ) : (
            course.quizzes.map((quiz) => (
              <details key={quiz.id} className="rounded-lg border bg-card">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  {quiz.title}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({plural(quiz.questions.length, "pregunta", "preguntas")})
                  </span>
                </summary>
                <div className="space-y-4 border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Aprueba con {quiz.passingPercentage}% ·{" "}
                    {quiz.retriesAllowed === null
                      ? "intentos ilimitados"
                      : `${plural(1 + quiz.retriesAllowed, "intento", "intentos")} como máximo`}
                    {quiz.lessonId && lessonTitle.has(quiz.lessonId)
                      ? ` · Lección: ${lessonTitle.get(quiz.lessonId)}`
                      : ""}
                  </p>
                  <Markdown source={quiz.descriptionMd} />
                  <ol className="space-y-4">
                    {quiz.questions.map((q, i) => (
                      <li key={q.id} className="space-y-2">
                        <div className="flex gap-2 text-sm">
                          <span className="font-medium">{i + 1}.</span>
                          <div className="flex-1">
                            <Markdown source={q.questionMd} />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {q.answerType === "single"
                                ? "Una respuesta correcta"
                                : "Varias respuestas correctas"}{" "}
                              · {plural(q.points, "punto", "puntos")}
                            </p>
                          </div>
                        </div>
                        <ul className="space-y-1 pl-6">
                          {q.answers.map((a) => (
                            <li
                              key={a.id}
                              className={cn(
                                "flex items-start gap-2 text-sm",
                                a.isCorrect ? "font-medium text-success" : "text-text-2"
                              )}
                            >
                              {a.isCorrect ? (
                                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                              ) : (
                                <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                              )}
                              <span>
                                {a.text}
                                {a.isCorrect ? <span className="sr-only"> (correcta)</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
