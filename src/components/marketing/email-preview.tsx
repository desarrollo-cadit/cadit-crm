"use client";

import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignBody } from "@/lib/marketing/body";
import type { AudienceFilters } from "@/lib/marketing/audience";

/**
 * 045 (FR-009, US2-1/2) — La vista previa del correo, con el HTML que arma el
 * servidor (el mismo que se enviaría).
 *
 * Va en un `<iframe sandbox srcdoc>` SIN `allow-scripts`: aunque todo texto
 * ya llega escapado, el HTML del correo no corre nada dentro del panel.
 */

type Preview = { contact: { id: string; name: string; email: string } | null; subject: string; html: string };

export function EmailPreview({
  campaignId,
  subject,
  body,
  filters,
}: {
  campaignId: string;
  subject: string;
  body: CampaignBody;
  filters: AudienceFilters | null;
}) {
  const [contactId, setContactId] = useState<string>("");
  const [contactos, setContactos] = useState<{ contactId: string; name: string }[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  // Con quién se puede mirar: la primera página de la audiencia.
  useEffect(() => {
    if (!filters) {
      setContactos([]);
      return;
    }
    fetch("/api/marketing/audiences/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, page: 1, pageSize: 25 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { recipients: { contactId: string; name: string }[] } | null) => setContactos(d?.recipients ?? []))
      .catch(() => setContactos([]));
  }, [filters]);

  useEffect(() => {
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/marketing/campaigns/${campaignId}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, body, ...(contactId ? { contactId } : {}) }),
        });
        const data = await res.json().catch(() => null);
        if (n !== pedido.current) return;
        if (!res.ok) {
          setError(data?.error?.message ?? "No se pudo armar la vista previa.");
          return;
        }
        setError(null);
        setPreview(data as Preview);
      } catch {
        if (n === pedido.current) setError("No se pudo armar la vista previa.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [campaignId, subject, body, contactId]);

  return (
    <section className="space-y-2" aria-label="Vista previa">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Vista previa con</span>
        <Select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          aria-label="Contacto con que se personaliza"
          className="max-w-xs"
        >
          <option value="">{contactos.length > 0 ? "El primero de la audiencia" : "Sin contactos (textos alternativos)"}</option>
          {contactos.map((c) => (
            <option key={c.contactId} value={c.contactId}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!preview ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <p className="border-b bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Asunto: </span>
            {preview.subject || <span className="text-muted-foreground">(sin asunto)</span>}
          </p>
          <iframe
            title="Vista previa del correo"
            sandbox=""
            srcDoc={preview.html}
            className="h-[32rem] w-full bg-card"
          />
        </div>
      )}
    </section>
  );
}
