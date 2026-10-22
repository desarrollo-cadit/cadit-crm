"use client";

import { Badge } from "@/components/ui/badge";
import type { MarketingSettingsDto } from "@/server/marketing/settings";

/**
 * 045 (US5) — Estado del buzón de marketing. En esta etapa es de lectura: dice
 * qué está cargado y qué falta para poder enviar una campaña.
 */
export function MarketingSettingsClient({ initial }: { initial: MarketingSettingsDto }) {
  const s = initial;
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marketing</h2>
        <p className="text-sm text-muted-foreground">
          Las campañas salen de un buzón de Microsoft 365 propio, distinto del de los correos de
          los cursos{s.operationalSender ? ` (${s.operationalSender})` : ""}.
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-3 rounded-md border bg-card px-4 py-3 sm:grid-cols-2">
        <Dato label="Buzón de marketing">{s.senderEmail}</Dato>
        <Dato label="Nombre del remitente">{s.senderName}</Dato>
        <Dato label="Dirección de la academia">{s.footerAddress}</Dato>
        <Dato label="Dato de contacto">{s.footerContact}</Dato>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Badge variant={s.m365Configured ? "success" : "warning"}>
          {s.m365Configured ? "Microsoft 365 configurado" : "Microsoft 365 sin configurar"}
        </Badge>
        <Badge variant={s.verified ? "success" : "warning"}>
          {s.verified ? "Buzón probado" : "Buzón sin probar"}
        </Badge>
        <Badge variant={s.ready ? "success" : "secondary"}>
          {s.ready ? "Listo para enviar campañas" : "Todavía no se pueden enviar campañas"}
        </Badge>
      </div>
      {s.lastTestError && <p className="text-sm text-danger">Última prueba: {s.lastTestError}</p>}
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">
        {children || <span className="text-muted-foreground">Sin cargar</span>}
      </dd>
    </div>
  );
}
