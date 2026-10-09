"use client";

import { useState } from "react";
import { Copy, ExternalLink, KeyRound, Link2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * 030 US1 — Copiar el enlace, abrirlo, y copiar el código de acceso cuando
 * Zoom no lo embebió en el enlace (DV-008).
 *
 * "Ver" abre la grabación EN ZOOM, en otra pestaña: el CRM no reproduce, no
 * descarga ni intermedia video (constitución 1.6.0). Sin enlace todavía
 * (Zoom a veces tarda en procesar), los botones quedan deshabilitados y
 * dicen por qué.
 */
export function RecordingRowActions({
  playUrl,
  passcode,
  onAssign,
  assigned = false,
}: {
  playUrl: string | null;
  passcode: string | null;
  /** 030 US3 — Solo con `grabaciones.gestionar`: abre el panel de asignación. */
  onAssign?: () => void;
  assigned?: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);

  async function copiar(texto: string, mensaje: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(mensaje);
    } catch {
      setAviso("No se pudo copiar: seleccioná y copiá a mano.");
    }
    setTimeout(() => setAviso(null), 2500);
  }

  const sinEnlace = "Zoom todavía no dio el enlace de esta grabación.";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={!playUrl}
        title={playUrl ? "Copiar el enlace de la grabación" : sinEnlace}
        onClick={() => playUrl && void copiar(playUrl, "Enlace copiado")}
      >
        <Copy className="h-3.5 w-3.5" /> Copiar enlace
      </Button>
      {playUrl ? (
        <a
          href={playUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir la grabación en Zoom"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Ver
        </a>
      ) : (
        <Button size="sm" variant="ghost" disabled title={sinEnlace}>
          <ExternalLink className="h-3.5 w-3.5" /> Ver
        </Button>
      )}
      {passcode && (
        <Button
          size="sm"
          variant="ghost"
          title="El enlace no lleva el código: copialo para pasarlo junto al enlace"
          onClick={() => void copiar(passcode, "Código copiado")}
        >
          <KeyRound className="h-3.5 w-3.5" /> Código {passcode}
        </Button>
      )}
      {onAssign && (
        <Button size="sm" variant="ghost" onClick={onAssign}>
          <Link2 className="h-3.5 w-3.5" /> {assigned ? "Cambiar clase" : "Asignar a clase"}
        </Button>
      )}
      {aviso && (
        <span role="status" className="text-xs text-success">
          {aviso}
        </span>
      )}
    </div>
  );
}
