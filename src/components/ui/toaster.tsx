"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Toaster } from "sonner";
import { setNotifyNavigator } from "@/lib/notify";

/**
 * El contenedor de los toasts. Se monta UNA vez por caparazón —panel, portal
 * y acceso— y se dispara desde cualquier lado con `notify` (`@/lib/notify`).
 *
 * **La piel es nuestra, no la de la librería** (`unstyled: true`): fondo,
 * borde, texto e íconos salen de los tokens de `globals.css`, así que el
 * toast sigue al tema por la misma vía que el resto de la interfaz —el
 * `data-theme` que el servidor pone en `<html>` desde la cookie— y no hace
 * falta pasarle `theme` a sonner. Va montado ADENTRO de cada caparazón para
 * heredar también los radios de la superficie del portal (ver `portal-intensidad.test.ts`).
 *
 * Los pares de color que usa ya los mide `contraste.test.ts`: texto y
 * estados sobre `--bg`, en los dos temas.
 */

const ESCRITORIO = "(min-width: 768px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(ESCRITORIO);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function AppToaster() {
  const router = useRouter();
  useEffect(() => {
    setNotifyNavigator((href) => router.push(href));
    return () => setNotifyNavigator(null);
  }, [router]);

  // Abajo a la derecha en escritorio; abajo al centro en el celular, donde la
  // esquina queda debajo del pulgar y del cajón de navegación.
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(ESCRITORIO).matches,
    () => true
  );

  return (
    <Toaster
      position={desktop ? "bottom-right" : "bottom-center"}
      containerAriaLabel="Avisos"
      gap={10}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
        error: <XCircle className="h-4 w-4 text-destructive" aria-hidden />,
        warning: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />,
        info: <Info className="h-4 w-4 text-text-3" aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Cerrar aviso",
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-md border border-border bg-background py-3 pl-4 pr-9 text-sm text-foreground shadow-pop",
          success: "border-success-border",
          error: "border-danger-border",
          warning: "border-warning-border",
          icon: "mt-0.5 flex shrink-0 items-center",
          content: "min-w-0 flex-1",
          title: "font-medium leading-snug",
          description: "mt-0.5 text-xs text-text-2",
          actionButton:
            "shrink-0 self-center rounded-sm border border-border-strong px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          closeButton:
            "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm text-text-3 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        },
      }}
    />
  );
}
