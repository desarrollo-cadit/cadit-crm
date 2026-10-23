"use client";

import { useEffect, useState } from "react";
import { FileText, Mail, MailCheck, MailX, MessageCircle, StickyNote, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import {
  enlaceDeCorreo,
  enlaceDeWhatsApp,
  origenDelFormulario,
  type ActividadDto,
  type EntradaDeMarketing,
  type EntradaDeSeguimiento,
} from "@/lib/seguimiento";
import type { SeguimientoDto } from "@/server/seguimiento";
import { RecorridoComercialCard } from "@/components/contacts/recorrido-comercial-card";
import { cn } from "@/lib/utils";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ICONO: Record<EntradaDeSeguimiento["tipo"], LucideIcon> = {
  formulario: FileText,
  nota: StickyNote,
  contacto_email: Mail,
  contacto_whatsapp: MessageCircle,
  baja_marketing: MailX,
  baja_marketing_revertida: MailCheck,
};

const INTERES: Record<"curso" | "taller" | "general", string> = {
  curso: "Curso",
  taller: "Taller",
  general: "Campaña",
};

/**
 * La pestaña «Seguimiento» del contacto: lo que mandó por los formularios
 * públicos, las notas del equipo y cada vez que alguien le escribió.
 *
 * `canWrite` (`inscripciones.seguimiento`, resuelta en el servidor) decide si
 * se ofrece la nota y si tocar «Escribir por…» deja registro. Sin ella los
 * botones abren igual el correo o WhatsApp —el correo y el teléfono ya se ven
 * en el encabezado con `contactos.ver`— pero no escriben nada: la barrera real
 * es el `requireCapability` del POST.
 */
export function SeguimientoClient({ contactId, canWrite }: { contactId: string; canWrite: boolean }) {
  const [data, setData] = useState<SeguimientoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await fetch(`/api/contacts/${contactId}/seguimiento`).catch(() => null);
      if (!vigente) return;
      if (!res?.ok) {
        setError(
          res?.status === 404
            ? "Contacto no encontrado"
            : res?.status === 403
              ? "No tenés permiso para ver el seguimiento de este contacto"
              : "No se pudo cargar el seguimiento"
        );
        return;
      }
      setData((await res.json()) as SeguimientoDto);
    })();
    return () => {
      vigente = false;
    };
  }, [contactId, version]);

  const agregar = (a: ActividadDto) =>
    setData((d) => (d ? { ...d, timeline: [{ tipo: a.kind, ...a } as EntradaDeSeguimiento, ...d.timeline] } : d));

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-6">
      {/* 046 — qué cursó y qué le podría interesar, al atenderlo (SC-001). */}
      <RecorridoComercialCard contactId={contactId} />
      <ContactCard contactId={contactId} contact={data.contact} canWrite={canWrite} onRecorded={agregar} />
      <MarketingCard contactId={contactId} marketing={data.marketing} onChanged={() => setVersion((v) => v + 1)} />
      {canWrite ? <NoteForm contactId={contactId} onAdded={agregar} /> : null}
      <Timeline timeline={data.timeline} />
    </div>
  );
}

/** Registra el contacto sin demorar la apertura del enlace. */
function registrarContacto(contactId: string, kind: "contacto_email" | "contacto_whatsapp") {
  return fetch(`/api/contacts/${contactId}/seguimiento`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind }),
    // Sobrevive aunque la pestaña pierda el foco o el navegador abra el mailto.
    keepalive: true,
  })
    .then(async (res) => (res.ok ? ((await res.json()) as { activity: ActividadDto }).activity : null))
    .catch(() => null);
}

function ContactCard({
  contactId,
  contact,
  canWrite,
  onRecorded,
}: {
  contactId: string;
  contact: SeguimientoDto["contact"];
  canWrite: boolean;
  onRecorded: (a: ActividadDto) => void;
}) {
  const mailto = enlaceDeCorreo(contact.email);
  const wa = enlaceDeWhatsApp(contact.phone);

  const alTocar = (kind: "contacto_email" | "contacto_whatsapp") => () => {
    if (!canWrite) return;
    // El enlace se abre YA (lo hace el navegador con el <a>); el registro va
    // en paralelo y, si falla, se avisa sin deshacer nada.
    void registrarContacto(contactId, kind).then((a) => {
      if (a) onRecorded(a);
      else notify.warning("Se abrió el enlace, pero no se pudo registrar el contacto");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contactar</CardTitle>
        <CardDescription>
          {canWrite
            ? "Cada vez que escribas desde acá queda registrado en la línea de tiempo."
            : "Tu rol no registra estos contactos: los botones solo abren el correo o WhatsApp."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <ContactButton
          href={mailto}
          icon={Mail}
          label="Escribir por correo"
          detail={contact.email}
          missing="No tiene correo cargado."
          onClick={alTocar("contacto_email")}
        />
        <ContactButton
          href={wa}
          icon={MessageCircle}
          label="Escribir por WhatsApp"
          detail={contact.phone}
          missing={
            contact.phone
              ? "El teléfono cargado no se puede usar en WhatsApp."
              : "No tiene teléfono cargado (puede haber escrito por WhatsApp sin mostrar su número)."
          }
          onClick={alTocar("contacto_whatsapp")}
          newTab
        />
      </CardContent>
    </Card>
  );
}

function ContactButton({
  href,
  icon: Icon,
  label,
  detail,
  missing,
  onClick,
  newTab = false,
}: {
  href: string | null;
  icon: LucideIcon;
  label: string;
  detail: string | null;
  missing: string;
  onClick: () => void;
  newTab?: boolean;
}) {
  const faltaId = `falta-${label.toLowerCase().replace(/\s+/g, "-")}`;
  if (!href) {
    return (
      <div className="space-y-1">
        <Button variant="outline" className="w-full" disabled aria-describedby={faltaId}>
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </Button>
        <p id={faltaId} className="text-xs text-muted-foreground">
          {missing}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <a
        href={href}
        onClick={onClick}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </a>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function NoteForm({ contactId, onAdded }: { contactId: string; onAdded: (a: ActividadDto) => void }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/contacts/${contactId}/seguimiento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "nota", body }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      notify.error(res?.status === 403 ? "No tenés permiso para agregar notas" : "No se pudo guardar la nota");
      return;
    }
    onAdded(((await res.json()) as { activity: ActividadDto }).activity);
    setBody("");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={guardar} className="space-y-3">
          <label htmlFor="nota-seguimiento" className="text-sm font-medium">
            Agregar una nota
          </label>
          <Textarea
            id="nota-seguimiento"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Por ejemplo: pidió que lo llamemos el lunes a la tarde."
            rows={3}
            maxLength={4000}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!body.trim()}>
              Guardar nota
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Timeline({ timeline }: { timeline: EntradaDeSeguimiento[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Línea de tiempo</CardTitle>
        <CardDescription>Formularios, notas y contactos, lo más nuevo primero.</CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay formularios, notas ni contactos registrados para esta persona.
          </p>
        ) : (
          <ol className="space-y-4" aria-label="Línea de tiempo del seguimiento">
            {timeline.map((e) => (
              <TimelineItem key={e.id} entrada={e} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({ entrada: e }: { entrada: EntradaDeSeguimiento }) {
  const Icon = ICONO[e.tipo];
  return (
    <li className="flex gap-3" data-tipo={e.tipo}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {e.tipo === "formulario" ? (
          <FormEntry entrada={e} />
        ) : e.tipo === "baja_marketing" || e.tipo === "baja_marketing_revertida" ? (
          <MarketingEntry entrada={e} />
        ) : (
          <ActivityEntry entrada={e} />
        )}
      </div>
    </li>
  );
}

function FormEntry({ entrada: e }: { entrada: Extract<EntradaDeSeguimiento, { tipo: "formulario" }> }) {
  const titulo = e.interestName ?? e.source.replace(/^formulario:/, "");  const campos: [string, string | null][] = [
    ["Nombre", [e.firstName, e.lastName].filter(Boolean).join(" ")],
    ["Teléfono", e.phone],
    ["Correo", e.email],
    ["Empresa", e.company],
    ["Grupo", e.cohortName],
    ["Resultado", e.result],
  ];
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Formulario: {titulo}</span>
        <Badge variant="secondary">{INTERES[e.interestKind]}</Badge>
      </p>
      <p className="text-xs text-muted-foreground">
        {fechaHora(e.at)} · {origenDelFormulario(e.source, e.interestName)}
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {campos
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>
      {e.message ? (
        <blockquote className="whitespace-pre-wrap rounded-md border-l-2 border-primary bg-secondary px-3 py-2 text-sm">
          {e.message}
        </blockquote>
      ) : null}
    </>
  );
}

const TITULO_ACTIVIDAD: Record<"nota" | "contacto_email" | "contacto_whatsapp", string> = {
  nota: "Nota",
  contacto_email: "Contactado por correo",
  contacto_whatsapp: "Contactado por WhatsApp",
};

function ActivityEntry({
  entrada: e,
}: {
  entrada: Extract<EntradaDeSeguimiento, { tipo: "nota" | "contacto_email" | "contacto_whatsapp" }>;
}) {
  return (
    <>
      <p className="text-sm">
        <span className="font-medium">{TITULO_ACTIVIDAD[e.tipo]}</span>
        <span className="text-muted-foreground"> · {e.authorName ?? "Cuenta eliminada"}</span>
      </p>
      <p className="text-xs text-muted-foreground">{fechaHora(e.at)}</p>
      {e.body ? <p className="whitespace-pre-wrap text-sm">{e.body}</p> : null}
    </>
  );
}

/** 045 (FR-013) — La baja o la reactivación de los correos de marketing. */
function MarketingEntry({ entrada: e }: { entrada: EntradaDeMarketing }) {
  return (
    <>
      <p className="text-sm">
        {e.tipo === "baja_marketing" ? (
          <span className="font-medium">
            Se dio de baja de los correos de marketing{e.campaignName ? ` (campaña «${e.campaignName}»)` : ""}
          </span>
        ) : (
          <>
            <span className="font-medium">Se reactivaron los correos de marketing</span>
            <span className="text-muted-foreground"> · {e.authorName ?? "Cuenta eliminada"}</span>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{fechaHora(e.at)}</p>
    </>
  );
}

/**
 * 045 (FR-013, FR-015; US4-5) — ¿Recibe campañas? Reactivar solo se ofrece
 * con `marketing.configurar` (`revertible`, decidido en el servidor): deshace
 * una oposición expresa de la persona. Los correos de sus cursos no dependen
 * de esto.
 */
function MarketingCard({
  contactId,
  marketing,
  onChanged,
}: {
  contactId: string;
  marketing: SeguimientoDto["marketing"];
  onChanged: () => void;
}) {
  const [reactivando, setReactivando] = useState(false);
  if (marketing.estado === "suscripto") return null;

  async function reactivar() {
    if (!window.confirm("¿Reactivar los correos de marketing para esta persona? Se había dado de baja ella misma.")) {
      return;
    }
    setReactivando(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/marketing-unsubscribe`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        notify.error(body?.error?.message ?? "No se pudo reactivar.");
        return;
      }
      notify.success("Se reactivaron los correos de marketing.");
      onChanged();
    } finally {
      setReactivando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailX className="h-4 w-4" aria-hidden />
          No recibe correos de marketing
        </CardTitle>
        <CardDescription>
          Se dio de baja el {fechaHora(marketing.desde)}
          {marketing.campana ? ` desde la campaña «${marketing.campana}»` : ""}. Los correos de sus cursos le
          siguen llegando.
        </CardDescription>
      </CardHeader>
      {marketing.revertible ? (
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => void reactivar()} loading={reactivando}>
            Reactivar correos de marketing
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
