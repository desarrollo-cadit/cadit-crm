"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Resource = {
  id: string;
  title: string;
  url: string;
  kind: "guia" | "ejemplo" | "enlace" | "video";
};

const KIND_LABELS: Record<Resource["kind"], string> = {
  guia: "Guía",
  ejemplo: "Ejemplo",
  enlace: "Enlace",
  video: "Video",
};

/**
 * 013 (T023, FR-006/FR-007) — El material, que son ENLACES.
 *
 * Un solo componente para los dos contenedores: el material de un CURSO
 * (aplica a todas sus cohortes) y el de una CLASE puntual. Son la misma
 * pantalla porque son la misma cosa desde el punto de vista de quien la
 * carga; lo único que cambia es de qué cuelga.
 *
 * El sistema no almacena archivos: guarda dónde están (decisión marco).
 */
export function ResourcesPanel({
  courseId,
  classSessionId,
  canEdit,
}: {
  courseId?: string;
  classSessionId?: string;
  /** `academico.editar`. */
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Resource["kind"]>("enlace");

  const query = courseId
    ? `courseId=${encodeURIComponent(courseId)}`
    : `classSessionId=${encodeURIComponent(classSessionId ?? "")}`;

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/resources?${query}`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar el material");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { resources: Resource[] };
    setItems(data.resources);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function agregar() {
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        url,
        kind,
        // Uno u otro, nunca los dos: lo exige el servidor y el CHECK.
        courseId: courseId ?? null,
        classSessionId: classSessionId ?? null,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(data?.error?.message ?? "No se pudo guardar el material");
      return;
    }
    setError(null);
    setTitle("");
    setUrl("");
    setAbierto(false);
    void refetch();
  }

  async function quitar(id: string) {
    await fetch(`/api/resources/${id}`, { method: "DELETE" }).catch(() => null);
    void refetch();
  }

  if (loading) return null;

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-2 py-1 text-xs">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="truncate underline"
              >
                {r.title}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {KIND_LABELS[r.kind]}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1"
                  aria-label={`Quitar ${r.title}`}
                  onClick={() => void quitar(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit &&
        (abierto ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={title}
              placeholder="Título"
              className="h-8 w-44"
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              value={url}
              placeholder="https://…"
              className="h-8 w-64"
              onChange={(e) => setUrl(e.target.value)}
            />
            <Select
              value={kind}
              className="h-8 w-28"
              onChange={(e) => setKind(e.target.value as Resource["kind"])}
            >
              {(Object.keys(KIND_LABELS) as Resource["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void agregar()}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" />
            Agregar material
          </Button>
        ))}
    </div>
  );
}
