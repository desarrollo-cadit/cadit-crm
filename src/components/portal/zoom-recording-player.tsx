import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { zoomEmbedUrl } from "@/lib/zoom/links";

/**
 * 030 — EL componente del reproductor de grabaciones de Zoom (constitución
 * 1.7.0, principio II ítem 5: iframe cargado solo por el navegador, aislado
 * tras un componente). Nada más en la app embebe Zoom; el servidor no
 * descarga, no retransmite ni guarda video: la clase sigue teniendo solo un
 * ENLACE (`class_session.recording_url`) y este componente lo muestra.
 *
 * Qué se embebe lo decide `zoomEmbedUrl` (lista de permitidos). Un enlace que
 * no pasa no renderiza nada: quien lo usa sigue mostrando el enlace de siempre.
 *
 * El sandbox: el reproductor de Zoom es una página entera (scripts, cookies
 * de su propio origen para la sesión del código de acceso, el formulario del
 * código cuando el enlace no lo trae, "abrir en Zoom" en ventana nueva y
 * pantalla completa). `allow-same-origin` + `allow-scripts` NO es un escape
 * acá porque el contenido es de OTRO origen; lo que el sandbox sí corta es
 * navegar la página de arriba (sin `allow-top-navigation`), las descargas y
 * los diálogos modales. Si una versión futura del reproductor dejara de
 * funcionar con sandbox, sacarlo es una línea — el enlace de abajo sigue.
 *
 * "Abrir en Zoom" va SIEMPRE: un iframe de otro origen que falla (Zoom niega
 * el embed, la grabación venció, una extensión lo bloquea) no se puede
 * detectar desde acá, a diferencia de Vimeo, que contesta mensajes.
 */

const SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
].join(" ");

/** ¿Este enlace se puede ver embebido? Los portales eligen botón o enlace con esto. */
export function isZoomRecording(url: string | null | undefined): boolean {
  return zoomEmbedUrl(url) !== null;
}

export function ZoomRecordingPlayer({
  url,
  title,
  id,
  className,
}: {
  url: string;
  /** El nombre accesible del iframe ("Grabación de la clase 3"). */
  title: string;
  id?: string;
  className?: string;
}) {
  const src = zoomEmbedUrl(url);
  if (!src) return null;

  return (
    <div id={id} className={cn("space-y-2", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-secondary shadow-sm">
        <iframe
          src={src}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox={SANDBOX}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <p className="text-xs text-text-3">
        ¿No se ve?{" "}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-brand-text underline underline-offset-2"
        >
          Abrir en Zoom
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
        </a>
      </p>
    </div>
  );
}
