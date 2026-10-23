"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import type { CampaignBody } from "@/lib/marketing/body";
import type { CampaignDto, FaltanteDeCampana } from "@/server/marketing/campaigns";
import { BlockEditor, type ErrorDeCampo, type ImagenDeCampana } from "./block-editor";
import { EmailPreview } from "./email-preview";
import { SendDialog } from "./send-dialog";

/**
 * 045 (US2; FR-007…FR-010) — Redactar una campaña: nombre, asunto,
 * audiencia, bloques, vista previa y envío de prueba al propio correo.
 * De solo lectura cuando la campaña ya no es un borrador (`readOnly`).
 */

const FALTA: Record<FaltanteDeCampana, string> = {
  buzon: "configurar el buzón de marketing, el remitente y el pie",
  buzon_sin_verificar: "probar el buzón de marketing",
  m365: "configurar Microsoft 365 en el servidor",
  audiencia: "elegir una audiencia",
  asunto: "escribir el asunto",
  cuerpo: "escribir el correo",
};

/** Un renglón vacío de una lista no es un ítem. */
function limpiar(body: CampaignBody): CampaignBody {
  return {
    ...body,
    blocks: body.blocks.map((b) =>
      b.type === "list" ? { ...b, items: b.items.map((i) => i.trim()).filter(Boolean) } : b
    ),
  };
}

export function CampaignEditor({
  initial,
  audiences,
  canEdit,
}: {
  /** `null` = campaña nueva: primero se crea, después se redacta. */
  initial: CampaignDto | null;
  audiences: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const editable = canEdit && (!initial || !initial.readOnly);
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [audienceId, setAudienceId] = useState(initial?.audienceId ?? "");
  const [body, setBody] = useState<CampaignBody>(initial?.body ?? { v: 1, blocks: [] });
  const [images, setImages] = useState<ImagenDeCampana[]>(initial?.images ?? []);
  const [errors, setErrors] = useState<ErrorDeCampo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [enviar, setEnviar] = useState(false);

  async function guardar(): Promise<boolean> {
    if (!name.trim()) {
      notify.error("Poné un nombre para la campaña.");
      return false;
    }
    setGuardando(true);
    try {
      const payload = initial
        ? { name: name.trim(), subject, body: limpiar(body), audienceId: audienceId || null }
        : { name: name.trim(), subject, ...(audienceId ? { audienceId } : {}) };
      const res = await fetch(initial ? `/api/marketing/campaigns/${initial.id}` : "/api/marketing/campaigns", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(data?.error?.fields ?? []);
        notify.error(data?.error?.message ?? "No se pudo guardar la campaña.");
        return false;
      }
      setErrors([]);
      notify.success("Campaña guardada.");
      if (!initial) router.replace(`/marketing/campanas/${(data as CampaignDto).id}`);
      else router.refresh();
      return true;
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    if (!initial) return;
    if (!(await guardar())) return;
    setProbando(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${initial.id}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify.error(data?.error?.message ?? "No se pudo enviar la prueba.");
        return;
      }
      notify.success(`Se envió a ${(data as { sentTo: string }).sentTo}.`);
    } finally {
      setProbando(false);
    }
  }

  async function borrar() {
    if (!initial) return;
    if (!window.confirm(`¿Borrar la campaña «${initial.name}»? También se borran sus imágenes.`)) return;
    const res = await fetch(`/api/marketing/campaigns/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      notify.error(data?.error?.message ?? "No se pudo borrar la campaña.");
      return;
    }
    notify.success("Campaña borrada.");
    router.push("/marketing");
  }

  const filtros = initial?.audienceId === (audienceId || null) ? (initial?.filters ?? null) : null;
  const subjectError = errors.find((e) => e.path === "subject");

  return (
    <div className="space-y-6">
      {initial && !initial.readOnly && !initial.readiness.ok && (
        <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Para poder enviarla falta {initial.readiness.missing.map((m) => FALTA[m]).join(", ")}.
            {initial.readiness.missing.some((m) => m === "buzon" || m === "buzon_sin_verificar") && (
              <>
                {" "}
                <Link href={initial.readiness.settingsHref} className="underline">
                  Ir a Ajustes › Marketing
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Datos de la campaña">
        <div className="space-y-1">
          <Label htmlFor="campaign-name">Nombre (interno)</Label>
          <Input id="campaign-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={!editable} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="campaign-audience">Audiencia</Label>
          <Select
            id="campaign-audience"
            value={audienceId}
            onChange={(e) => setAudienceId(e.target.value)}
            disabled={!editable}
          >
            <option value="">Elegí una audiencia…</option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="campaign-subject">Asunto</Label>
          <Input
            id="campaign-subject"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!editable}
            placeholder="Ej.: {{nombre|Hola}}, arrancan los grupos de noviembre"
          />
          {subjectError && <p className="text-xs text-danger">{subjectError.message}</p>}
        </div>
      </section>

      {initial ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-2" aria-label="Correo">
            <h2 className="text-sm font-semibold">Correo</h2>
            <BlockEditor
              campaignId={initial.id}
              body={body}
              onChange={setBody}
              images={images}
              onImagesChange={setImages}
              errors={errors}
              disabled={!editable}
            />
          </section>
          <EmailPreview campaignId={initial.id} subject={subject} body={limpiar(body)} filters={filtros} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Guardá la campaña para empezar a redactar el correo.</p>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void guardar()} loading={guardando}>
            {initial ? "Guardar" : "Crear campaña"}
          </Button>
          {initial && (
            <>
              <Button variant="outline" onClick={() => void probar()} loading={probando}>
                <Send className="h-4 w-4" aria-hidden />
                Enviar prueba a mi correo
              </Button>
              <Button
                onClick={async () => {
                  if (await guardar()) setEnviar(true);
                }}
                disabled={!initial.readiness.ok}
                title={initial.readiness.ok ? undefined : "Completá lo que falta para poder enviarla"}
              >
                <Send className="h-4 w-4" aria-hidden />
                Enviar campaña
              </Button>
              <Button variant="outline" onClick={() => void borrar()}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Borrar
              </Button>
            </>
          )}
        </div>
      )}

      {enviar && initial?.filters && (
        <SendDialog
          campaignId={initial.id}
          filters={initial.filters}
          onClose={() => setEnviar(false)}
          onSent={() => {
            setEnviar(false);
            notify.success("Envío confirmado: los correos salen de a uno.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
