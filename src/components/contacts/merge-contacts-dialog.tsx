"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Combine } from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { lineasDeConteos, type VistaPreviaDeUnificacion } from "@/lib/contact-merge";
import { notify } from "@/lib/notify";
import { fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ContactPicker } from "@/components/contacts/contact-picker";

/**
 * 2026-10-26 — "Unificar contactos": buscar al duplicado, ver la vista previa
 * (quién queda, cómo queda cada dato, qué se mueve y qué bloquea) y recién
 * ahí confirmar. Es IRREVERSIBLE: el absorbido se borra. El servidor vuelve a
 * validar todo al confirmar (`POST /api/contacts/[id]/merge`).
 *
 * Se abre desde el legajo ("Unificar con…") y desde el 409 de duplicado al
 * editar un contacto, ya con el otro elegido (`otro`).
 */
export function MergeContactsDialog({
  contactId,
  otro = null,
  onClose,
}: {
  contactId: string;
  otro?: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [elegido, setElegido] = useState<ContactDto | null>(null);
  const [otroId, setOtroId] = useState<string | null>(otro?.id ?? null);
  const [keep, setKeep] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [preview, setPreview] = useState<VistaPreviaDeUnificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [unificando, setUnificando] = useState(false);

  useEffect(() => {
    if (!otroId) {
      setPreview(null);
      return;
    }
    let cancelado = false;
    const params = new URLSearchParams({ with: otroId });
    if (keep) params.set("keep", keep);
    if (primary) {
      params.set("primary", primary);
      if (secondary) params.set("secondary", secondary);
    }
    setCargando(true);
    setError(null);
    void (async () => {
      const res = await fetch(
        `/api/contacts/${encodeURIComponent(contactId)}/merge-preview?${params}`
      ).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | { preview?: VistaPreviaDeUnificacion; error?: { message?: string } }
        | null;
      if (cancelado) return;
      setCargando(false);
      if (!res?.ok || !data?.preview) {
        setPreview(null);
        setError(data?.error?.message ?? "No se pudo armar la vista previa.");
        return;
      }
      setPreview(data.preview);
      if (data.preview.correos.requiereEleccion && primary === null) {
        setPrimary(data.preview.correos.primary);
        setSecondary(data.preview.correos.secondary);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [contactId, otroId, keep, primary, secondary]);

  async function unificar() {
    if (!preview || !otroId) return;
    setUnificando(true);
    const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        withId: otroId,
        keepId: preview.survivor.id,
        emails:
          preview.correos.requiereEleccion && primary ? { primary, secondary } : null,
        confirm: true,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { survivorId?: string; error?: { message?: string } }
      | null;
    setUnificando(false);
    if (!res?.ok || !data?.survivorId) {
      setError(data?.error?.message ?? "No se pudo unificar. No se cambió nada.");
      return;
    }
    notify.success(`Se unificó con ${preview.absorbed.name}.`);
    onClose();
    router.push(`/contacts/${encodeURIComponent(data.survivorId)}/legajo?tab=seguimiento`);
    router.refresh();
  }

  const lineas = preview ? lineasDeConteos(preview.conteos) : [];
  const nombreDelOtro =
    [preview?.survivor, preview?.absorbed].find((p) => p?.id === otroId)?.name ??
    otro?.name ??
    (elegido ? fullName(elegido) : "…");
  const bloqueado = !preview || preview.bloqueos.length > 0 || Boolean(preview.correos.error);

  return (
    <Modal
      onClose={onClose}
      busy={unificando}
      labelledBy="merge-contacts-title"
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <h3 id="merge-contacts-title" className="mb-1 font-semibold">
        Unificar contactos
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Juntá dos contactos que son la misma persona. Todo lo del contacto que se absorbe pasa al
        que queda.
      </p>

      {!otroId ? (
        <div className="space-y-2">
          <ContactPicker
            id="merge-contact-search"
            label="¿Con qué contacto lo unificás?"
            value={elegido}
            onChange={(c) => {
              if (c && c.id === contactId) {
                setError("Elegí otro contacto: es el mismo.");
                return;
              }
              setError(null);
              setElegido(c);
              setOtroId(c?.id ?? null);
            }}
          />
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Unificar con <span className="font-medium text-foreground">{nombreDelOtro}</span>
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => {
              setOtroId(null);
              setElegido(null);
              setKeep(null);
              setPrimary(null);
              setSecondary(null);
            }}
          >
            Elegir otro
          </button>
        </div>
      )}

      {cargando && !preview && <p className="text-sm text-muted-foreground">Armando la vista previa…</p>}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PersonaCard titulo="Queda este contacto" persona={preview.survivor} />
            <PersonaCard titulo="Se absorbe (se borra)" persona={preview.absorbed} />
          </div>
          {preview.puedeElegir ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKeep(preview.absorbed.id)}
              disabled={cargando}
            >
              Que quede {preview.absorbed.name}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Queda el contacto que tiene WhatsApp: es su identidad y no se cambia.
            </p>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Dato</th>
                  <th className="px-3 py-2 font-medium">Queda</th>
                  <th className="px-3 py-2 font-medium">Se absorbe</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.campos.map((c) => (
                  <tr key={c.campo} className="border-t align-top">
                    <td className="px-3 py-2 font-medium">{c.etiqueta}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.queda ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.absorbido ?? "—"}</td>
                    <td className="whitespace-pre-line px-3 py-2">{c.resultado ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.correos.requiereEleccion && (
            <div className="space-y-2 rounded-md border px-3 py-3">
              <p className="text-sm font-medium">Entre los dos hay más de dos correos: elegí cuáles quedan.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Correo principal</span>
                  <Select
                    value={primary ?? ""}
                    onChange={(e) => {
                      setPrimary(e.target.value || null);
                      if (e.target.value === secondary) setSecondary(null);
                    }}
                  >
                    {preview.correos.opciones.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Correo secundario</span>
                  <Select value={secondary ?? ""} onChange={(e) => setSecondary(e.target.value || null)}>
                    <option value="">Ninguno</option>
                    {preview.correos.opciones
                      .filter((c) => c !== primary)
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </Select>
                </label>
              </div>
              {preview.correos.descartados.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se descartan (quedan anotados): {preview.correos.descartados.join(", ")}
                </p>
              )}
              {preview.correos.error && <p className="text-xs text-danger">{preview.correos.error}</p>}
            </div>
          )}

          <div className="text-sm">
            <p className="font-medium">Se van a mover al que queda:</p>
            {lineas.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {lineas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nada más que sus datos.</p>
            )}
          </div>

          {preview.bloqueos.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              {preview.bloqueos.map((b) => (
                <p key={b.mensaje}>{b.mensaje}</p>
              ))}
            </div>
          )}

          <p className="text-sm font-medium">Esta acción no se puede deshacer.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={unificando}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={bloqueado || cargando || unificando}
          onClick={() => void unificar()}
        >
          {unificando ? "Unificando…" : "Unificar"}
        </Button>
      </div>
    </Modal>
  );
}

function PersonaCard({
  titulo,
  persona,
}: {
  titulo: string;
  persona: VistaPreviaDeUnificacion["survivor"];
}) {
  return (
    <div className="space-y-1 rounded-md border px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold">{persona.name}</p>
      <p className="text-xs text-muted-foreground">
        {[persona.email, persona.phone].filter(Boolean).join(" · ") || "Sin correo ni teléfono"}
      </p>
      <Badge variant={persona.identidadReal ? "success" : "secondary"}>
        {persona.identidadReal ? "Con WhatsApp" : "Sin WhatsApp"}
      </Badge>
    </div>
  );
}

/** El botón del legajo. Solo se dibuja con `contactos.unificar` (lo decide la página). */
export function MergeContactsLauncher({ contactId }: { contactId: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Combine className="mr-1.5 h-4 w-4" aria-hidden />
        Unificar con…
      </Button>
      {abierto && <MergeContactsDialog contactId={contactId} onClose={() => setAbierto(false)} />}
    </>
  );
}
