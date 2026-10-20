"use client";

import { useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";

/**
 * Sube la imagen del taller. Es la portada de su curso (`course.image_url`):
 * misma ruta, mismo volumen local y misma URL pública que la de cualquier
 * curso, y la que la web ya lee en `/api/public/talleres`.
 * Devuelve el motivo si falló; `null` si salió bien.
 */
export async function subirImagenDeTaller(courseId: string, file: File): Promise<string | null> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/courses/${courseId}/image`, { method: "PUT", body }).catch(
    () => null
  );
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? "error de red";
}

/** La imagen del taller en el detalle: la actual, cambiarla o quitarla. */
export function WorkshopImageField({
  courseId,
  imageUrl,
  workshopName,
  canEdit,
  onChanged,
}: {
  courseId: string;
  imageUrl: string | null;
  workshopName: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function subir(file: File | null) {
    if (!file) return;
    setBusy(true);
    const error = await subirImagenDeTaller(courseId, file);
    setBusy(false);
    if (error) {
      notify.error(`No se pudo subir la imagen: ${error}`);
      return;
    }
    notify.success("Imagen del taller actualizada.");
    onChanged();
  }

  async function quitar() {
    setBusy(true);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error("No se pudo quitar la imagen.");
      return;
    }
    notify.success("Imagen quitada.");
    onChanged();
  }

  if (!canEdit && !imageUrl) return null;

  return (
    <section aria-label="Imagen del taller" className="flex flex-wrap items-center gap-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={workshopName}
          className="h-20 w-32 shrink-0 rounded-md border object-cover"
        />
      ) : (
        <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
          <ImageIcon className="h-6 w-6" aria-hidden />
        </div>
      )}
      {canEdit && (
        <div className="space-y-1">
          <Label htmlFor="taller-imagen">
            {imageUrl ? "Cambiar la imagen (sale en la web)" : "Imagen del taller (sale en la web)"}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="taller-imagen"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => void subir(e.target.files?.[0] ?? null)}
            />
            {imageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void quitar()}
                aria-label="Quitar imagen"
                title="Quitar imagen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG o WebP, hasta 5 MB. Es la misma para todas las ediciones del taller.
          </p>
        </div>
      )}
    </section>
  );
}
