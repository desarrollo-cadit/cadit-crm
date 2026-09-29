"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "./api";
import { StatusToggle } from "./course-editor";
import { EditorDialog, ErrorText } from "./dialog";

/**
 * cursos-offline T11b — "Nuevo curso" on the library. Creates it (draft by
 * default) and opens its editor, where lessons, topics and quizzes are added.
 */
export function NewCourseButton() {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) {
      setError("Falta el título.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callApi<{ id: string }>("/api/offline-courses", "POST", {
      title,
      descriptionMd: description,
      status,
    });
    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }
    router.push(`/cursos-offline/${result.data.id}`);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Nuevo curso
      </Button>
      {open && (
        <EditorDialog
          title="Nuevo curso"
          onClose={() => setOpen(false)}
          busy={saving}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button loading={saving} onClick={() => void create()}>
                Crear y editar
              </Button>
            </>
          }
        >
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>Título</Label>
            <Input id={titleId} value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={descriptionId}>Descripción (opcional)</Label>
            <Textarea
              id={descriptionId}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Admite markdown; se puede editar después con vista previa.</p>
          </div>
          <StatusToggle value={status} onChange={setStatus} />
          <ErrorText>{error}</ErrorText>
        </EditorDialog>
      )}
    </>
  );
}
