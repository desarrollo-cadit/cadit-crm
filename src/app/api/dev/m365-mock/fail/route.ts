import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { setFail } from "@/server/dev/m365-mock-state";

/** 029 — `{ fail: true }` hace que el próximo `sendMail` responda 500 (camino infeliz). */
export const dynamic = "force-dynamic";

const bodySchema = z.object({ fail: z.boolean() });

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { message: "Body: { fail: boolean }" } }, { status: 422 });
  }
  setFail(parsed.data.fail);
  return Response.json({ fail: parsed.data.fail });
}
