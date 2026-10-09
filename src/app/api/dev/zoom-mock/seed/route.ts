import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { resetZoomMock, seedZoomMock } from "@/server/dev/zoom-mock-state";

/** 030 — `POST` reemplaza cuentas/usuarios/grabaciones del zoom-mock; `DELETE` lo vacía. */
export const dynamic = "force-dynamic";

const recordingSchema = z
  .object({ uuid: z.string(), id: z.union([z.number(), z.string()]), start_time: z.string() })
  .passthrough();

const seedSchema = z.object({
  accounts: z.array(
    z.object({
      accountId: z.string().min(1),
      users: z.array(
        z
          .object({ id: z.string().min(1), email: z.string(), recordings: z.array(recordingSchema).optional() })
          .passthrough()
      ),
    })
  ),
  pageSize: z.number().int().min(1).optional(),
});

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const parsed = seedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { message: "Body: { accounts: [...], pageSize? }" } }, { status: 422 });
  }
  seedZoomMock(parsed.data as Parameters<typeof seedZoomMock>[0]);
  return Response.json({ ok: true });
}

export async function DELETE() {
  const guard = mockGuard();
  if (guard) return guard;
  resetZoomMock();
  return Response.json({ ok: true });
}
