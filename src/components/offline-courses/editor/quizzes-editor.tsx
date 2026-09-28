"use client";

import { useId, useState } from "react";
import { Check, Circle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Markdown } from "@/components/offline-courses/markdown";
import { MAX_RETRIES, parseRetries } from "@/lib/offline-course-editor";
import type { OfflineCourseDetail } from "@/server/offline-courses/library";
import { cn } from "@/lib/utils";
import { callApi, coursePath } from "./api";
import { ConfirmDeleteDialog, EditorDialog, ErrorText, IconButton } from "./dialog";
import { MarkdownField } from "./markdown-field";
import { QuestionDialog } from "./question-dialog";
import { SortableList } from "./sortable-list";

type Course = OfflineCourseDetail;
export type Quiz = Course["quizzes"][number];
export type Question = Quiz["questions"][number];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Editing =
  | { kind: "quiz"; quiz: Quiz | null }
  | { kind: "question"; quizId: string; question: Question | null }
  | { kind: "delete-quiz"; quiz: Quiz }
  | { kind: "delete-question"; quizId: string; question: Question }
  | null;

/** First line of the question's markdown, for labels and the folded row. */
const questionLabel = (q: Question) => q.questionMd.split("\n")[0]?.trim().slice(0, 120) || "Pregunta";

/**
 * cursos-offline T11b — Quizzes (sortable) and their questions (sortable).
 * Editing a quiz with attempts is allowed: each attempt keeps its own score
 * and answer snapshot. Deleting one with attempts is not (409, shown as is).
 */
export function QuizzesEditor({ course, refresh }: { course: Course; refresh: () => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const base = coursePath(course.id);
  const lessonTitle = new Map(course.lessons.map((l) => [l.id, l.title]));
  const close = () => setEditing(null);
  const done = () => {
    setEditing(null);
    refresh();
  };

  async function reorder(url: string, ids: string[]) {
    const result = await callApi(url, "PUT", { ids });
    if (result.ok) refresh();
    return result;
  }

  return (
    <section aria-labelledby="cuestionarios" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="cuestionarios" className="text-sm font-semibold">
          Cuestionarios
        </h3>
        <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "quiz", quiz: null })}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Agregar cuestionario
        </Button>
      </div>

      {course.quizzes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este curso no tiene cuestionarios.</p>
      ) : (
        <SortableList
          items={course.quizzes}
          itemLabel={(q) => q.title}
          onReorder={(ids) => reorder(`${base}/quizzes/order`, ids)}
          className="space-y-3"
          itemClassName="rounded-lg border bg-card"
          renderItem={(quiz, { handle }) => (
            <>
              <div className="flex items-start gap-2 px-2 py-2">
                {handle}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {quiz.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({plural(quiz.questions.length, "pregunta", "preguntas")})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aprueba con {quiz.passingPercentage}% ·{" "}
                    {quiz.retriesAllowed === null
                      ? "intentos ilimitados"
                      : `${plural(1 + quiz.retriesAllowed, "intento", "intentos")} como máximo`}
                    {quiz.lessonId && lessonTitle.has(quiz.lessonId)
                      ? ` · Lección: ${lessonTitle.get(quiz.lessonId)}`
                      : " · Del curso"}
                  </p>
                </div>
                <IconButton label={`Editar el cuestionario «${quiz.title}»`} onClick={() => setEditing({ kind: "quiz", quiz })}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Eliminar el cuestionario «${quiz.title}»`}
                  onClick={() => setEditing({ kind: "delete-quiz", quiz })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              </div>
              <div className="space-y-2 border-t px-3 py-3">
                {quiz.descriptionMd.trim() && <Markdown source={quiz.descriptionMd} className="text-sm" />}
                {quiz.questions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin preguntas: el cuestionario no se puede rendir.</p>
                ) : (
                  <SortableList
                    items={quiz.questions}
                    itemLabel={questionLabel}
                    onReorder={(ids) => reorder(`${base}/quizzes/${quiz.id}/questions/order`, ids)}
                    className="space-y-1.5"
                    itemClassName="flex items-start gap-1 rounded-md border bg-subtle px-1 py-1"
                    renderItem={(question, { index, handle: questionHandle }) => (
                      <>
                        {questionHandle}
                        <details className="min-w-0 flex-1 py-1">
                          <summary className="cursor-pointer text-sm">
                            {index + 1}. {questionLabel(question)}{" "}
                            <span className="text-xs text-muted-foreground">
                              · {question.answerType === "single" ? "una correcta" : "varias correctas"} ·{" "}
                              {plural(question.points, "punto", "puntos")}
                            </span>
                          </summary>
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <Markdown source={question.questionMd} />
                            <ul className="space-y-1">
                              {question.answers.map((a) => (
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
                          </div>
                        </details>
                        <IconButton
                          label={`Editar la pregunta ${index + 1}`}
                          onClick={() => setEditing({ kind: "question", quizId: quiz.id, question })}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Eliminar la pregunta ${index + 1}`}
                          onClick={() => setEditing({ kind: "delete-question", quizId: quiz.id, question })}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                      </>
                    )}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "question", quizId: quiz.id, question: null })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Agregar pregunta
                </Button>
              </div>
            </>
          )}
        />
      )}

      {editing?.kind === "quiz" && (
        <QuizDialog course={course} quiz={editing.quiz} onClose={close} onSaved={done} />
      )}
      {editing?.kind === "question" && (
        <QuestionDialog
          courseId={course.id}
          quizId={editing.quizId}
          question={editing.question}
          onClose={close}
          onSaved={done}
        />
      )}
      {editing?.kind === "delete-quiz" && (
        <ConfirmDeleteDialog
          title="Eliminar cuestionario"
          message={
            <p>
              ¿Eliminar «{editing.quiz.title}» y sus {plural(editing.quiz.questions.length, "pregunta", "preguntas")}?
            </p>
          }
          onConfirm={() => callApi(`${base}/quizzes/${editing.quiz.id}`, "DELETE")}
          onDone={done}
          onClose={close}
        />
      )}
      {editing?.kind === "delete-question" && (
        <ConfirmDeleteDialog
          title="Eliminar pregunta"
          message={
            <p>
              ¿Eliminar la pregunta «{questionLabel(editing.question)}»? Los intentos ya rendidos conservan su
              resultado.
            </p>
          }
          onConfirm={() => callApi(`${base}/quizzes/${editing.quizId}/questions/${editing.question.id}`, "DELETE")}
          onDone={done}
          onClose={close}
        />
      )}
    </section>
  );
}

function QuizDialog({
  course,
  quiz,
  onClose,
  onSaved,
}: {
  course: Course;
  quiz: Quiz | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const passingId = useId();
  const retriesId = useId();
  const lessonId = useId();
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [description, setDescription] = useState(quiz?.descriptionMd ?? "");
  const [passing, setPassing] = useState(String(quiz?.passingPercentage ?? 80));
  const [unlimited, setUnlimited] = useState(quiz ? quiz.retriesAllowed === null : true);
  const [retries, setRetries] = useState(String(quiz?.retriesAllowed ?? 1));
  const [lesson, setLesson] = useState(quiz?.lessonId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    const pct = passing.trim();
    if (!/^\d+$/.test(pct) || Number(pct) > 100) {
      setError("El porcentaje para aprobar debe ser un número entero entre 0 y 100.");
      return;
    }
    const parsedRetries = parseRetries(unlimited, retries);
    if (!parsedRetries.ok) {
      setError(parsedRetries.message);
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      title,
      descriptionMd: description,
      passingPercentage: Number(pct),
      retriesAllowed: parsedRetries.value,
      lessonId: lesson || null,
    };
    const result = quiz
      ? await callApi(`${coursePath(course.id)}/quizzes/${quiz.id}`, "PATCH", body)
      : await callApi(`${coursePath(course.id)}/quizzes`, "POST", body);
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.message);
  }

  return (
    <EditorDialog
      title={quiz ? "Editar cuestionario" : "Nuevo cuestionario"}
      onClose={onClose}
      busy={saving}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor={titleId}>Título</Label>
        <Input id={titleId} value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </div>
      <MarkdownField label="Descripción (opcional)" value={description} onChange={setDescription} rows={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={passingId}>% para aprobar</Label>
          <Input
            id={passingId}
            type="number"
            min={0}
            max={100}
            step={1}
            value={passing}
            onChange={(e) => setPassing(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={retriesId}>Reintentos</Label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
              Ilimitados
            </label>
            <Input
              id={retriesId}
              type="number"
              min={0}
              max={MAX_RETRIES}
              step={1}
              value={unlimited ? "" : retries}
              disabled={unlimited}
              className="w-24"
              onChange={(e) => setRetries(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {unlimited
              ? "El alumno puede rendirlo las veces que quiera."
              : "Cantidad de veces que puede volver a rendirlo después del primer intento."}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={lessonId}>Lección (opcional)</Label>
        <Select id={lessonId} value={lesson} onChange={(e) => setLesson(e.target.value)}>
          <option value="">Ninguna: es del curso</option>
          {course.lessons.map((l, i) => (
            <option key={l.id} value={l.id}>
              {i + 1}. {l.title}
            </option>
          ))}
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
    </EditorDialog>
  );
}
