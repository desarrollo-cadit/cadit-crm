"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { pushSupport, urlBase64ToUint8Array } from "@/lib/push/client-keys";
import { cn } from "@/lib/utils";

type Config = { enabled: boolean; publicKey: string | null; devTools: boolean };
type Estado = "cargando" | "oculto" | "ios_sin_instalar" | "bloqueado" | "apagado" | "prendido";

const PRUEBAS = [
  {
    etiqueta: "Corrección publicada",
    title: "Corrección publicada",
    body: "Ya podés ver el resultado de tu evaluación.",
    url: "/portal",
  },
  {
    etiqueta: "Entrega por vencer",
    title: "Entrega por vencer",
    body: "Te quedan 2 días para entregar “Trabajo final”.",
    url: "/portal",
  },
  {
    etiqueta: "Clase por empezar",
    title: "Clase en 1 hora",
    body: "Revit Básico · hoy 19:00",
    url: "/portal",
  },
] as const;

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // `ready` never resolves when no worker is registered (dev builds), so race it.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
}

/**
 * Per-device switch for push notifications (student portal). The permission
 * prompt is only ever raised from the button click: iOS ignores it otherwise.
 * Renders nothing when the instance has no push keys.
 */
export function PushToggle() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [config, setConfig] = useState<Config | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const leer = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/me/push/config", { cache: "no-store" });
      if (!res.ok) return setEstado("oculto");
      const cfg = (await res.json()) as Config;
      setConfig(cfg);
      if (!cfg.enabled || !cfg.publicKey) return setEstado("oculto");

      const soporte = pushSupport({
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: "Notification" in window,
        isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
      });
      if (soporte === "unsupported") return setEstado("oculto");
      if (soporte === "needs_install") return setEstado("ios_sin_instalar");
      if (Notification.permission === "denied") return setEstado("bloqueado");

      const reg = await registro();
      if (!reg) return setEstado("oculto");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub && Notification.permission === "granted" ? "prendido" : "apagado");
    } catch {
      setEstado("oculto");
    }
  }, []);

  useEffect(() => {
    void leer();
  }, [leer]);

  async function activar() {
    if (!config?.publicKey) return;
    setOcupado(true);
    setMensaje(null);
    try {
      // Called straight from the click: required by iOS.
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }
      const reg = await registro();
      if (!reg) throw new Error("sin_service_worker");
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        }));
      const res = await fetch("/api/portal/me/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("alta_fallida");
      setEstado("prendido");
    } catch {
      setMensaje("No pudimos activar los avisos. Probá de nuevo.");
      setEstado("apagado");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/portal/me/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("apagado");
    } catch {
      setMensaje("No pudimos desactivar los avisos. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  async function probar(p: (typeof PRUEBAS)[number]) {
    setMensaje(null);
    const res = await fetch("/api/portal/me/push/dev-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: p.title, body: p.body, url: p.url }),
    });
    if (!res.ok) return setMensaje("La prueba no está disponible.");
    const data = (await res.json()) as { devices: number };
    setMensaje(
      data.devices === 0
        ? "No hay dispositivos suscriptos."
        : `Enviada a ${data.devices} dispositivo${data.devices === 1 ? "" : "s"}.`
    );
  }

  if (estado === "cargando" || estado === "oculto") return null;

  if (estado === "ios_sin_instalar") {
    return (
      <p className="mt-3 rounded-md px-2.5 py-2 text-[11px] leading-snug text-text-3">
        Para recibir avisos, agregá esta app a la pantalla de inicio desde Safari (Compartir →
        Añadir a pantalla de inicio) y abrila desde el ícono.
      </p>
    );
  }

  const prendido = estado === "prendido";
  return (
    <div className="mt-3 rounded-md px-2.5 py-2">
      {estado === "bloqueado" ? (
        <p className="text-[11px] leading-snug text-text-3">
          Los avisos están bloqueados en este dispositivo. Habilitalos desde los ajustes del
          navegador o de la app.
        </p>
      ) : (
        <button
          type="button"
          disabled={ocupado}
          onClick={prendido ? desactivar : activar}
          aria-pressed={prendido}
          className={cn(
            "flex min-h-[44px] w-full items-center gap-[11px] rounded-sm px-2 text-sm font-medium transition-colors md:min-h-0 md:py-2",
            "[-webkit-tap-highlight-color:transparent] active:bg-accent hover:bg-accent disabled:opacity-60",
            prendido ? "text-brand-text" : "text-text-2"
          )}
        >
          {prendido ? (
            <Bell className="h-[18px] w-[18px] text-brand" strokeWidth={1.7} />
          ) : (
            <BellOff className="h-[18px] w-[18px] text-text-3" strokeWidth={1.7} />
          )}
          {prendido ? "Avisos activados" : "Activar avisos"}
        </button>
      )}

      {config?.devTools && prendido && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          <span className="px-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
            Probar (solo desarrollo)
          </span>
          {PRUEBAS.map((p) => (
            <button
              key={p.etiqueta}
              type="button"
              onClick={() => void probar(p)}
              className="flex min-h-[40px] items-center gap-2 rounded-sm px-2 text-left text-[13px] text-text-2 transition-colors hover:bg-accent active:bg-accent md:min-h-0 md:py-1.5"
            >
              <Send className="h-3.5 w-3.5 text-text-3" strokeWidth={1.7} />
              {p.etiqueta}
            </button>
          ))}
        </div>
      )}

      {mensaje && <p className="mt-1.5 px-2 text-[11px] text-text-3">{mensaje}</p>}
    </div>
  );
}
