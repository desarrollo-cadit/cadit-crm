"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Announcement = {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: string;
};

/**
 * 013 (T024, FR-008) — Los avisos de la cohorte.
 *
 * **No notifican todavía** (DV-003): se registran y se ven. La notificación
 * llega con 017. Lo que resuelve esta pantalla hoy es lo que pedía la spec
 * —que "no me enteré" deje de ser una discusión— y eso lo dan el AUTOR y la
 * FECHA, bien visibles, no el aviso en sí.
 */
export function AnnouncementsClient({
  cohortId,
  canPublish,
}: {
  cohortId: string;
  /** `academico.editar`. */
  canPublish: boolean;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/announcements`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar los avisos");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { announcements: Announcement[] };
    setItems(data.announcements);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function publicar() {
    setSaving(true);
    const res = await fetch(`/api/cohorts/${cohortId}/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body }),
    }).catch(() => null);
    setSaving(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(data?.error?.message ?? "No se pudo publicar el aviso");
      return;
    }
    setError(null);
    setTitle("");
    setBody("");
    void refetch();
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-UY", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4 p-6">
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {canPublish && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="anc-title">Título</Label>
            <Input
              id="anc-title"
              value={title}
              placeholder="La clase del jueves se pasa al viernes"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anc-body">Aviso</Label>
            <Textarea
              id="anc-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              loading={saving}
              disabled={!title.trim() || !body.trim()}
              onClick={() => void publicar()}
            >
              {!saving && <Megaphone className="h-4 w-4" />}
              {saving ? "Publicando…" : "Publicar aviso"}
            </Button>
            {/* Que no notifique todavía se DICE, no se deja suponer: si el
                equipo cree que el alumno recibe un mail, no lo avisa por
                WhatsApp y el aviso no llega a nadie. */}
            <span className="text-xs text-muted-foreground">
              Queda registrado y visible. Todavía no envía notificación.
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay avisos en esta cohorte.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-md border p-4">
              <p className="font-medium">{a.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {a.authorName ?? "Autor dado de baja"} · {fecha(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
