import { toast } from "sonner";

/**
 * Toasts — el aviso de un EVENTO.
 *
 * Toast = el resultado de algo que la persona acaba de HACER (guardar, crear,
 * borrar, asignar, copiar, sincronizar, enviar, invitar) o un aviso pasajero.
 * Inline = lo que no puede desaparecer: el error de un campo junto al campo,
 * un secreto que se muestra una sola vez (la contraseña del portal), y el
 * ESTADO de una pantalla (vacía, error de carga, "sincronización apagada").
 * La regla completa vive en DESIGN.md.
 *
 * Esta es la ÚNICA puerta a `sonner` (más el `<AppToaster>` que lo monta):
 * `tests/unit/notify.test.ts` falla si otro archivo lo importa. Así las
 * duraciones, el botón de cierre y la piel por tokens son una garantía y no
 * una costumbre.
 */

/** Cuánto vive cada aviso. Un error se lee con más calma que un "listo". */
export const TOAST_DURATION = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
} as const;

export interface NotifyOptions {
  /** Segunda línea, más chica. */
  description?: string;
  /** Mismo id = reemplaza al anterior en vez de apilar otro igual. */
  id?: string | number;
  /** Un enlace de acción ("Configurar" → /settings/zoom). */
  action?: { label: string; href: string };
  /** Solo se va cuando la persona lo cierra. */
  persist?: boolean;
}

type Navigate = (href: string) => void;

/**
 * El `<AppToaster>` registra acá el `router.push` de Next, para que el enlace
 * de un toast navegue sin recargar la página. Fuera de React (o antes de que
 * el Toaster monte) se cae a una navegación común.
 */
let navigator: Navigate | null = null;
export function setNotifyNavigator(fn: Navigate | null): void {
  navigator = fn;
}

function go(href: string): void {
  if (navigator) navigator(href);
  else if (typeof window !== "undefined") window.location.assign(href);
}

type Kind = keyof typeof TOAST_DURATION;

function show(kind: Kind, message: string, opts: NotifyOptions = {}) {
  return toast[kind](message, {
    duration: opts.persist ? Infinity : TOAST_DURATION[kind],
    // Lo que se lee con calma también se tiene que poder cerrar sin esperar.
    closeButton: kind === "error" || kind === "warning" || Boolean(opts.persist),
    ...(opts.description !== undefined ? { description: opts.description } : {}),
    ...(opts.id !== undefined ? { id: opts.id } : {}),
    ...(opts.action
      ? {
          action: {
            label: opts.action.label,
            onClick: () => go(opts.action!.href),
          },
        }
      : {}),
  });
}

export const notify = {
  success: (message: string, opts?: NotifyOptions) => show("success", message, opts),
  info: (message: string, opts?: NotifyOptions) => show("info", message, opts),
  warning: (message: string, opts?: NotifyOptions) => show("warning", message, opts),
  error: (message: string, opts?: NotifyOptions) => show("error", message, opts),
};
