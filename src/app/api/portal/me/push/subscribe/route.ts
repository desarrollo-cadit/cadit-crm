import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { quitarSuscripcion, registrarSuscripcion } from "@/server/push/subscriptions";

const Alta = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});
const Baja = z.object({ endpoint: z.string().url().max(2000) });

/** 0097 — El dispositivo del alumno activa los avisos. Idempotente por endpoint. */
export const POST = requireStudentPortal(async (ctx, req: Request) => {
  const body = await parseBody(req, Alta);
  if (!body.ok) return body.response;
  await registrarSuscripcion(
    { organizationId: ctx.organizationId, userId: ctx.userId, contactId: ctx.contactId },
    {
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
      userAgent: req.headers.get("user-agent"),
    }
  );
  return NextResponse.json({ ok: true });
});

/** Desactiva los avisos de ESTE dispositivo. */
export const DELETE = requireStudentPortal(async (ctx, req: Request) => {
  const body = await parseBody(req, Baja);
  if (!body.ok) return body.response;
  await quitarSuscripcion(
    { organizationId: ctx.organizationId, userId: ctx.userId },
    body.data.endpoint
  );
  return NextResponse.json({ ok: true });
});
