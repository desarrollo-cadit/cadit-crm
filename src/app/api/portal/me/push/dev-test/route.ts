import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { pushDevToolsEnabled } from "@/lib/push/dev";
import { normalizarPayload } from "@/lib/push/payload";
import { enviarAUsuario } from "@/server/push/subscriptions";

const Body = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(400).optional(),
  url: z.string().max(300).optional(),
});

const handler = requireStudentPortal(async (ctx, req: Request) => {
  const parsed = await parseBody(req, Body, { emptyAs: {} });
  if (!parsed.ok) return parsed.response;
  const payload = normalizarPayload({
    title: parsed.data.title ?? "Corrección publicada",
    body: parsed.data.body ?? "Ya podés ver el resultado de tu evaluación.",
    url: parsed.data.url,
    tag: "dev-test",
  });
  const results = await enviarAUsuario(
    { organizationId: ctx.organizationId, userId: ctx.userId },
    payload
  );
  return NextResponse.json({ payload, devices: results.length, results });
});

/**
 * DEV ONLY — manda una notificación de prueba a los dispositivos de quien la
 * pide, para ver cómo se ve. 404 indistinguible de una ruta inexistente salvo
 * en local/túnel con `PUSH_DEV_TOOLS=true` (`pushDevToolsEnabled`).
 */
export const POST = async (req: Request) => {
  if (!pushDevToolsEnabled()) return new Response(null, { status: 404 });
  return handler(req);
};
