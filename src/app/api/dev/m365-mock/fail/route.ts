import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { setDeny, setFail, setThrottle } from "@/server/dev/m365-mock-state";

/**
 * 029 — `{ fail: true }` hace que el próximo `sendMail` responda 500 (camino infeliz).
 * 045 — `{ throttle: n }`: los próximos n envíos responden 429 con
 * `Retry-After: 1`; `{ deny: true }`: 403 `ErrorAccessDenied` hasta apagarlo.
 * `DELETE /outbox` apaga todos los modos.
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    fail: z.boolean().optional(),
    throttle: z.number().int().min(0).max(1000).optional(),
    deny: z.boolean().optional(),
  })
  .refine((b) => b.fail !== undefined || b.throttle !== undefined || b.deny !== undefined);

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { message: "Body: { fail?: boolean, throttle?: number, deny?: boolean }" } },
      { status: 422 }
    );
  }
  if (parsed.data.fail !== undefined) setFail(parsed.data.fail);
  if (parsed.data.throttle !== undefined) setThrottle(parsed.data.throttle);
  if (parsed.data.deny !== undefined) setDeny(parsed.data.deny);
  return Response.json(parsed.data);
}
