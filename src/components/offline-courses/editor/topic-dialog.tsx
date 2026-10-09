"use client";

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { videoUrlState } from "@/lib/offline-course-editor";
import { cn } from "@/lib/utils";
import { callApi, coursePath } from "./api";
import { EditorDialog, ErrorText } from "./dialog";
import type { Lesson, Topic } from "./lessons-editor";
import { MarkdownField } from "./markdown-field";
import { notify } from "@/lib/notify";

/**
 * cursos-offline T11b — New topic / edit topic: title, lesson (moving it to
 * another lesson appends it at the end of that one), Vimeo URL, where the
 * video goes, and the text.
 *
 * The URL is checked while typing with the same parser as the server and the
 * player (`videoUrlState` → `parseVimeoUrl`): a URL the player could not play
 * would lock the topic for every student, so the form will not send it.
 */
export function TopicDialog({
  courseId,
  lessons,
  lessonId,
  topic,
  onClose,
  onSaved,
}: {
  courseId: string;
  lessons: readonly Lesson[];
  lessonId: string;
  topic: Topic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const lessonFieldId = useId();
  const videoId = useId();
  const videoHelpId = useId();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [targetLesson, setTargetLesson] = useState(lessonId);
  const [videoUrl, setVideoUrl] = useState(topic?.videoUrl ?? "");
  const [videoShown, setVideoShown] = useState<"before" | "after">(topic?.videoShown ?? "after");
  const [content, setContent] = useState(topic?.contentMd ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = videoUrlState(videoUrl);

  async function save() {
    if (!title.trim()) {
      setError("Falta el título.");
      return;
    }
    if (video.kind === "invalid") {
      setError("La URL de video no es un video de Vimeo válido.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      title,
      contentMd: content,
      videoUrl: video.kind === "empty" ? null : videoUrl.trim(),
      videoShown,
    };
    const result = topic
      ? await callApi(`${coursePath(courseId)}/topics/${topic.id}`, "PATCH", {
          ...body,
          ...(targetLesson !== lessonId ? { lessonId: targetLesson } : {}),
        })
      : await callApi(`${coursePath(courseId)}/lessons/${lessonId}/topics`, "POST", body);
    setSaving(false);
    if (result.ok) {
      notify.success("Tema guardado.");
      onSaved();
    } else notify.error(result.message);
  }

  return (
    <EditorDialog
      title={topic ? "Editar tema" : "Nuevo tema"}
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

      {topic && lessons.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={lessonFieldId}>Lección</Label>
          <Select id={lessonFieldId} value={targetLesson} onChange={(e) => setTargetLesson(e.target.value)}>
            {lessons.map((l, i) => (
              <option key={l.id} value={l.id}>
                {i + 1}. {l.title}
              </option>
            ))}
          </Select>
          {targetLesson !== lessonId && (
            <p className="text-xs text-muted-foreground">El tema pasa al final de esa lección.</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={videoId}>Video de Vimeo (opcional)</Label>
        <Input
          id={videoId}
          value={videoUrl}
          maxLength={500}
          placeholder="https://vimeo.com/123456789"
          aria-invalid={video.kind === "invalid" || undefined}
          aria-describedby={videoHelpId}
          className={cn(video.kind === "invalid" && "border-destructive hover:border-destructive")}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
        <p id={videoHelpId} className="text-xs">
          {video.kind === "empty" && <span className="text-muted-foreground">Sin video: el tema es solo texto.</span>}
          {video.kind === "invalid" && (
            <span className="text-destructive">
              No es un video de Vimeo válido. Pegá el enlace del video, por ejemplo https://vimeo.com/123456789.
            </span>
          )}
          {video.kind === "valid" && (
            <a
              href={video.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-text underline-offset-2 hover:underline"
            >
              Ver en Vimeo
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </p>
      </div>

      {video.kind !== "empty" && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Dónde va el video</legend>
          <div className="flex gap-4 text-sm">
            {(
              [
                { value: "before", label: "Antes del texto" },
                { value: "after", label: "Después del texto" },
              ] as const
            ).map((o) => (
              <label key={o.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${videoId}-shown`}
                  value={o.value}
                  checked={videoShown === o.value}
                  onChange={() => setVideoShown(o.value)}
                  className="accent-primary"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <MarkdownField label="Contenido" value={content} onChange={setContent} rows={10} />
      <ErrorText>{error}</ErrorText>
    </EditorDialog>
  );
}
