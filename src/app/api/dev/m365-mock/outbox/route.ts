import { mockGuard } from "@/lib/dev-guard";
import { clearOutbox, readOutbox } from "@/server/dev/m365-mock-state";

/** 029 — Lo que el CRM "mandó" por correo (GET) y su limpieza (DELETE, apaga la falla). */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = mockGuard();
  if (guard) return guard;
  return Response.json({ outbox: readOutbox() });
}

export async function DELETE() {
  const guard = mockGuard();
  if (guard) return guard;
  clearOutbox();
  return Response.json({ cleared: true });
}
