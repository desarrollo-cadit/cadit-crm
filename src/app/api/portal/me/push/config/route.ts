import { NextResponse } from "next/server";
import { requireStudentPortal } from "@/lib/portal-api";
import { clavePublicaVapid, pushDisponible } from "@/lib/push";
import { pushDevToolsEnabled } from "@/lib/push/dev";

/**
 * 0097 — Lo que el navegador necesita para suscribirse: si el push está
 * disponible y la clave PÚBLICA de VAPID. La privada jamás sale del servidor.
 * `devTools` solo es true en local/túnel (ver `pushDevToolsEnabled`).
 */
export const GET = requireStudentPortal(async () => {
  return NextResponse.json({
    enabled: pushDisponible(),
    publicKey: clavePublicaVapid(),
    devTools: pushDevToolsEnabled(),
  });
});
