import { eq } from "drizzle-orm";
import { archiveOrDeleteContact } from "@/server/contacts-admin";
import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  getContactById,
  getContactStage,
  serializeContact,
} from "@/server/contacts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = requireCapability(
  "contactos.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contacto no encontrado");
  const stageRow = await getContactStage(session.organizationId, id);
  return Response.json({
    contact: serializeContact(contact),
    stage: stageRow
      ? {
          id: stageRow.stage.id,
          name: stageRow.stage.name,
          position: stageRow.stage.position,
          kind: stageRow.stage.kind,
        }
      : null,
    lead: stageRow ? { id: stageRow.lead.id } : null,
  });
});

/**
 * Iteración 6 (feedback en vivo: "si le da a editar solo se edita nombre...
 * es clave poder editar todo") — antes solo se podía tocar name/notes/
 * archived. `phone`/`waIdentity` quedan AFUERA a propósito: es la identidad
 * estable de WhatsApp ("estable de por vida", ver CLAUDE.md) — cambiarla acá
 * migraría de qué conversación depende un contacto, una feature distinta y
 * más riesgosa que "editar los datos del contacto".
 */
const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  nationalId: z.string().trim().max(60).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  utmCampaign: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const PATCH = requireCapability(
  "contactos.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.firstName !== undefined) set.firstName = body.data.firstName;
  if (body.data.lastName !== undefined) set.lastName = body.data.lastName;
  if (body.data.email !== undefined) set.email = body.data.email;
  if (body.data.nationalId !== undefined) set.nationalId = body.data.nationalId;
  if (body.data.source !== undefined) set.source = body.data.source;
  if (body.data.utmCampaign !== undefined) set.utmCampaign = body.data.utmCampaign;
  if (body.data.notes !== undefined) set.notes = body.data.notes;
  if (body.data.archived !== undefined) {
    set.archivedAt = body.data.archived ? new Date() : null;
  }

  const db = getDb();
  const updated = await db
    .update(schema.contact)
    .set(set)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        eq(schema.contact.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Contacto no encontrado");
  return Response.json({ contact: serializeContact(updated[0]) });
});

/**
 * 014 (T005, DV-008) — Baja de un alumno.
 *
 * **Borra o archiva según lo que tenga que perder**, y esa decisión la toma el
 * servidor (`archiveOrDeleteContact`), no el navegador. Un contacto con
 * inscripciones NUNCA se borra: se archiva, porque el borrado cae en cascada
 * sobre sus notas, sus pagos y sus certificados emitidos.
 *
 * La respuesta dice cuál de las dos cosas pasó, para que la pantalla no tenga
 * que adivinar ni el usuario quedarse con la duda.
 */
export const DELETE = requireCapability(
  "contactos.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await archiveOrDeleteContact(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ accion: result.accion, motivo: result.motivo });
  }
);
