import { mockGuard } from "@/lib/dev-guard";
import { readZoomLog } from "@/server/dev/zoom-mock-state";

/** 030 — Pedidos que recibió el zoom-mock (método, ruta, query; sin headers de auth). */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = mockGuard();
  if (guard) return guard;
  return Response.json({ log: readZoomLog() });
}
