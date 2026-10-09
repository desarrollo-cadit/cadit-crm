"use client";

import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Library, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OfflineCourseStatusBadge } from "@/components/offline-courses/status-badge";
import type { OfflineCourseDetail } from "@/server/offline-courses/library";
import { cn } from "@/lib/utils";
import { callApi, coursePath } from "./api";
import { ConfirmDeleteDialog, ErrorText } from "./dialog";
import { LessonsEditor } from "./lessons-editor";
import { MarkdownField } from "./markdown-field";
import { QuizzesEditor } from "./quizzes-editor";
import { notify } from "@/lib/notify";

/**
 * cursos-offline T11b — The course page for whoever has `academico.editar`.
 *
 * The data comes from the server component (`courseDetail`); every change
 * goes through the staff API and then `router.refresh()` redraws the page
 * from the database, so what the editor shows is always what was saved.
 */
export function CourseEditor({ course }: { course: OfflineCourseDetail }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <div className="space-y-8">
      <CourseHeaderForm course={course} refresh={refresh} />
      <LessonsEditor course={course} refresh={refresh} />
      <QuizzesEditor course={course} refresh={refresh} />
    </div>
  );
}

type Status = OfflineCourseDetail["status"];

function CourseHeaderForm({ course, refresh }: { course: OfflineCourseDetail; refresh: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.descriptionMd);
  const [status, setStatus] = useState<Status>(course.status);
  const [saving, setSaving] = useState(false);
  /** Field validation (inline). Server results are announced with a toast. */
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = title !== course.title || description !== course.descriptionMd || status !== course.status;

  async function save() {
    if (!title.trim()) {
      setError("Falta el título.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callApi(coursePath(course.id), "PATCH", { title, descriptionMd: description, status });
    setSaving(false);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    notify.success("Cambios guardados.");
    refresh();
  }

  return (
    <section aria-labelledby="curso-datos" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="curso-datos" className="flex items-center gap-2 text-sm font-semibold">
          Datos del curso <OfflineCourseStatusBadge status={course.status} />
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Eliminar curso
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>Título</Label>
            <Input id={titleId} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <MarkdownField label="Descripción" value={description} onChange={setDescription} rows={5} />
          <StatusToggle value={status} onChange={setStatus} />
        </div>
        <ThumbnailField course={course} refresh={refresh} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Guardar cambios
        </Button>
        {dirty && !saving && <span className="text-xs text-muted-foreground">Hay cambios sin guardar.</span>}
      </div>
      <ErrorText>{error}</ErrorText>

      {confirmDelete && (
        <ConfirmDeleteDialog
          title="Eliminar curso"
          message={
            <p>
              ¿Eliminar «{course.title}» con todas sus lecciones, temas y cuestionarios? Si algún alumno ya
              tiene avance o intentos, no se va a poder: en ese caso conviene pasarlo a borrador.
            </p>
          }
          onConfirm={() => callApi(coursePath(course.id), "DELETE")}
          onDone={() => {
            setConfirmDelete(false);
            router.push("/cursos-offline");
            router.refresh();
          }}
          onClose={() => setConfirmDelete(false)}
          onHistory={{
            label: "Pasar a borrador",
            run: async () => {
              const result = await callApi(coursePath(course.id), "PATCH", { status: "draft" });
              if (result.ok) {
                setStatus("draft");
                setConfirmDelete(false);
                refresh();
              }
              return result;
            },
          }}
        />
      )}
    </section>
  );
}

/** Publicado / Borrador. A draft is invisible to students even when assigned. */
export function StatusToggle({ value, onChange }: { value: Status; onChange: (value: Status) => void }) {
  const options: Array<{ value: Status; label: string }> = [
    { value: "draft", label: "Borrador" },
    { value: "published", label: "Publicado" },
  ];
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">Estado</span>
      <div className="flex w-fit rounded-md border p-0.5" role="group" aria-label="Estado del curso">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === o.value ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === "published"
          ? "Los alumnos de las cohortes asignadas lo ven en su portal."
          : "Nadie lo ve en el portal, aunque esté asignado."}
      </p>
    </div>
  );
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Upload/replace/remove. The preview comes from the staff thumbnail route
 * (`academico.ver`); the stored URL changes with each upload, so it also
 * busts the browser cache.
 */
function ThumbnailField({ course, refresh }: { course: OfflineCourseDetail; refresh: () => void }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError("Se espera una imagen JPG, PNG o WebP de hasta 5 MB.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    const result = await callApi(`${coursePath(course.id)}/thumbnail`, "PUT", form);
    setBusy(false);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    notify.success("Portada actualizada.");
    refresh();
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Portada</span>
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${coursePath(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailUrl)}`}
          alt={`Portada de ${course.title}`}
          className="aspect-video w-full rounded-md border object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex aspect-video w-full items-center justify-center rounded-md border bg-brand-tint text-brand-text"
        >
          <Library className="h-8 w-8" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring",
            busy && "pointer-events-none opacity-50"
          )}
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {busy ? "Subiendo…" : course.thumbnailUrl ? "Reemplazar" : "Subir imagen"}
          <input
            id={inputId}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {course.thumbnailUrl && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>
            Quitar
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG o WebP, hasta 5 MB.</p>
      <ErrorText>{error}</ErrorText>
      {confirmRemove && (
        <ConfirmDeleteDialog
          title="Quitar portada"
          message={<p>El curso va a quedar sin imagen de portada.</p>}
          onConfirm={() => callApi(`${coursePath(course.id)}/thumbnail`, "DELETE")}
          onDone={() => {
            setConfirmRemove(false);
            refresh();
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
