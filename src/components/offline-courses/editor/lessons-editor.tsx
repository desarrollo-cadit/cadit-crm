"use client";

import { useId, useState } from "react";
import { Pencil, Plus, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/offline-courses/markdown";
import { TopicVideoLink } from "@/components/offline-courses/topic-video-link";
import type { OfflineCourseDetail } from "@/server/offline-courses/library";
import { callApi, coursePath } from "./api";
import { ConfirmDeleteDialog, EditorDialog, ErrorText, IconButton } from "./dialog";
import { MarkdownField } from "./markdown-field";
import { SortableList } from "./sortable-list";
import { TopicDialog } from "./topic-dialog";

type Course = OfflineCourseDetail;
export type Lesson = Course["lessons"][number];
export type Topic = Lesson["topics"][number];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Editing =
  | { kind: "lesson"; lesson: Lesson | null }
  | { kind: "topic"; lessonId: string; topic: Topic | null }
  | { kind: "delete-lesson"; lesson: Lesson }
  | { kind: "delete-topic"; topic: Topic }
  | null;

/**
 * cursos-offline T11b — Lessons (sortable) and, inside each, its topics
 * (sortable). A topic moves to another lesson from its own form.
 *
 * Each topic still folds open to its rendered content (the same view as the
 * read-only page): editing starts from looking at what the student sees.
 */
export function LessonsEditor({ course, refresh }: { course: Course; refresh: () => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const base = coursePath(course.id);
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
    <section aria-labelledby="lecciones" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="lecciones" className="text-sm font-semibold">
          Lecciones
        </h3>
        <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "lesson", lesson: null })}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Agregar lección
        </Button>
      </div>

      {course.lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este curso todavía no tiene lecciones.</p>
      ) : (
        <SortableList
          items={course.lessons}
          itemLabel={(l) => l.title}
          onReorder={(ids) => reorder(`${base}/lessons/order`, ids)}
          className="space-y-3"
          itemClassName="rounded-lg border bg-card"
          renderItem={(lesson, { index, handle }) => (
            <>
              <div className="flex items-center gap-2 px-2 py-2">
                {handle}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {index + 1}. {lesson.title}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({plural(lesson.topics.length, "tema", "temas")})
                  </span>
                </span>
                <IconButton label={`Editar la lección «${lesson.title}»`} onClick={() => setEditing({ kind: "lesson", lesson })}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Eliminar la lección «${lesson.title}»`}
                  onClick={() => setEditing({ kind: "delete-lesson", lesson })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              </div>
              <div className="space-y-2 border-t px-3 py-3">
                {lesson.contentMd.trim() && <Markdown source={lesson.contentMd} className="text-sm" />}
                {lesson.topics.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin temas.</p>
                ) : (
                  <SortableList
                    items={lesson.topics}
                    itemLabel={(t) => t.title}
                    onReorder={(ids) => reorder(`${base}/lessons/${lesson.id}/topics/order`, ids)}
                    className="space-y-1.5"
                    itemClassName="flex items-start gap-1 rounded-md border bg-subtle px-1 py-1"
                    renderItem={(topic, topicHandle) => (
                      <>
                        {topicHandle.handle}
                        <details className="min-w-0 flex-1 py-1">
                          <summary className="cursor-pointer text-sm">
                            {topic.title}
                            {topic.videoUrl && (
                              <Video className="ml-2 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Tiene video" />
                            )}
                          </summary>
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <TopicVideoLink url={topic.videoUrl} shown={topic.videoShown} />
                            {topic.contentMd.trim() ? (
                              <Markdown source={topic.contentMd} />
                            ) : (
                              <p className="text-sm text-muted-foreground">Sin contenido.</p>
                            )}
                          </div>
                        </details>
                        <IconButton
                          label={`Editar el tema «${topic.title}»`}
                          onClick={() => setEditing({ kind: "topic", lessonId: lesson.id, topic })}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Eliminar el tema «${topic.title}»`}
                          onClick={() => setEditing({ kind: "delete-topic", topic })}
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
                  onClick={() => setEditing({ kind: "topic", lessonId: lesson.id, topic: null })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Agregar tema
                </Button>
              </div>
            </>
          )}
        />
      )}

      {editing?.kind === "lesson" && (
        <LessonDialog courseId={course.id} lesson={editing.lesson} onClose={close} onSaved={done} />
      )}
      {editing?.kind === "topic" && (
        <TopicDialog
          courseId={course.id}
          lessons={course.lessons}
          lessonId={editing.lessonId}
          topic={editing.topic}
          onClose={close}
          onSaved={done}
        />
      )}
      {editing?.kind === "delete-lesson" && (
        <ConfirmDeleteDialog
          title="Eliminar lección"
          message={
            <p>
              ¿Eliminar «{editing.lesson.title}» y sus {plural(editing.lesson.topics.length, "tema", "temas")}? Los
              cuestionarios de la lección pasan a ser del curso.
            </p>
          }
          onConfirm={() => callApi(`${base}/lessons/${editing.lesson.id}`, "DELETE")}
          onDone={done}
          onClose={close}
        />
      )}
      {editing?.kind === "delete-topic" && (
        <ConfirmDeleteDialog
          title="Eliminar tema"
          message={<p>¿Eliminar el tema «{editing.topic.title}»?</p>}
          onConfirm={() => callApi(`${base}/topics/${editing.topic.id}`, "DELETE")}
          onDone={done}
          onClose={close}
        />
      )}
    </section>
  );
}

function LessonDialog({
  courseId,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string;
  lesson: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [content, setContent] = useState(lesson?.contentMd ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = { title, contentMd: content };
    const result = lesson
      ? await callApi(`${coursePath(courseId)}/lessons/${lesson.id}`, "PATCH", body)
      : await callApi(`${coursePath(courseId)}/lessons`, "POST", body);
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.message);
  }

  return (
    <EditorDialog
      title={lesson ? "Editar lección" : "Nueva lección"}
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
      <MarkdownField
        label="Introducción (opcional)"
        value={content}
        onChange={setContent}
        rows={4}
        hint="Se muestra arriba de los temas de la lección."
      />
      <ErrorText>{error}</ErrorText>
    </EditorDialog>
  );
}
