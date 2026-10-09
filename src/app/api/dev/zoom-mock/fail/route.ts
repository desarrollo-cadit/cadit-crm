import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { setZoomFail } from "@/server/dev/zoom-mock-state";

/** 030 — Los próximos `times` pedidos a la API del zoom-mock fallan con `status` (camino infeliz). */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.union([z.literal(401), z.literal(429), z.literal(500)]),
  times: z.number().int().min(0).max(100),
  retryAfterSec: z.number().int().min(0).max(60).optional(),
});

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { message: "Body: { status: 401|429|500, times, retryAfterSec? }" } },
      { status: 422 }
    );
  }
  setZoomFail(parsed.data);
  return Response.json({ ok: true });
}
