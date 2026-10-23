"use client";

import { useState } from "react";
import { CheckCircle2, Info, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";
import type { MarketingSettingsDto } from "@/server/marketing/settings";

/**
 * 045 (US5; FR-011, FR-016) — Configuración › Marketing: el buzón desde el
 * que salen las campañas (distinto del de los cursos), el remitente y el pie
 * que va en cada correo, y el botón para probar el buzón antes de usarlo.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Campo = "senderEmail" | "senderName" | "footerAddress" | "footerContact";

export function MarketingSettingsClient({ initial }: { initial: MarketingSettingsDto }) {
  const [s, setS] = useState(initial);
  const [form, setForm] = useState<Record<Campo, string>>({
    senderEmail: initial.senderEmail ?? "",
    senderName: initial.senderName ?? "",
    footerAddress: initial.footerAddress ?? "",
    footerContact: initial.footerContact ?? "",
  });
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  const set = (k: Campo) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const sinGuardar =
    form.senderEmail.trim().toLowerCase() !== (s.senderEmail ?? "") ||
    form.senderName.trim() !== (s.senderName ?? "") ||
    form.footerAddress.trim() !== (s.footerAddress ?? "") ||
    form.footerContact.trim() !== (s.footerContact ?? "");

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/settings/marketing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const fields = (data?.error?.fields ?? []) as { path: string; message: string }[];
        setErrores(Object.fromEntries(fields.map((f) => [f.path, f.message])));
        notify.error(data?.error?.message ?? "No se pudo guardar.");
        return;
      }
      setErrores({});
      setS(data as MarketingSettingsDto);
      notify.success("Ajustes de marketing guardados.");
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    setProbando(true);
    try {
      const res = await fetch("/api/settings/marketing/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify.error(data?.error?.message ?? "No se pudo probar el buzón.");
        return;
      }
      if (data?.ok) notify.success(`Listo: el correo de prueba salió hacia ${data.sentTo}.`);
      else notify.error(data?.error ?? "El buzón no pasó la prueba.");
      const actual = await fetch("/api/settings/marketing").then((r) => (r.ok ? r.json() : null));
      if (actual) setS(actual as MarketingSettingsDto);
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Marketing</h2>
        <p className="text-sm text-muted-foreground">
          Las campañas salen de un buzón de Microsoft 365 propio, distinto del de los correos de los cursos
          {s.operationalSender ? ` (${s.operationalSender})` : ""}. Cada correo lleva el remitente, la dirección
          y el contacto de abajo, y el enlace para darse de baja.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant={s.m365Configured ? "success" : "warning"}>
          {s.m365Configured ? "Microsoft 365 configurado" : "Microsoft 365 sin configurar en el servidor"}
        </Badge>
        <Badge variant={s.verified ? "success" : "warning"}>{s.verified ? "Buzón probado" : "Buzón sin probar"}</Badge>
        <Badge variant={s.ready ? "success" : "secondary"}>
          {s.ready ? "Listo para enviar campañas" : "Todavía no se pueden enviar campañas"}
        </Badge>
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mk-sender">Buzón de marketing</Label>
          <Input id="mk-sender" type="email" value={form.senderEmail} onChange={set("senderEmail")} maxLength={200} placeholder="novedades@tuacademia.com" />
          {errores.senderEmail && <p className="text-xs text-danger">{errores.senderEmail}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mk-name">Nombre del remitente</Label>
          <Input id="mk-name" value={form.senderName} onChange={set("senderName")} maxLength={80} />
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Exchange suele mostrar el nombre configurado en el buzón compartido: poné el mismo nombre allá.
          </p>
          {errores.senderName && <p className="text-xs text-danger">{errores.senderName}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="mk-address">Dirección de la academia</Label>
          <Input id="mk-address" value={form.footerAddress} onChange={set("footerAddress")} maxLength={200} />
          {errores.footerAddress && <p className="text-xs text-danger">{errores.footerAddress}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="mk-contact">Dato de contacto</Label>
          <Input id="mk-contact" value={form.footerContact} onChange={set("footerContact")} maxLength={200} placeholder="Correo, teléfono o web" />
          {errores.footerContact && <p className="text-xs text-danger">{errores.footerContact}</p>}
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={guardando}>
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void probar()}
            loading={probando}
            disabled={!s.senderEmail || sinGuardar}
            title={sinGuardar ? "Guardá los cambios antes de probar" : undefined}
          >
            <Send className="h-4 w-4" aria-hidden />
            Probar el buzón
          </Button>
        </div>
      </form>

      <div className="space-y-1 text-sm">
        {s.verified && s.verifiedAt && (
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Verificado el {fecha(s.verifiedAt)}.
          </p>
        )}
        {s.lastTestError && (
          <p className="text-danger">
            Última prueba{s.lastTestAt ? ` (${fecha(s.lastTestAt)})` : ""}: {s.lastTestError}
          </p>
        )}
        {!s.verified && s.senderEmail && !s.lastTestError && (
          <p className="text-muted-foreground">Probá el buzón: hasta que pase la prueba no se pueden enviar campañas.</p>
        )}
      </div>
    </div>
  );
}
