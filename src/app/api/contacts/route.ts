import { desc, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { serializeContact } from "@/server/contacts";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Iteración 3 (Parte C) — paginación real de servidor (page/pageSize), no
 * solo corte del array en el cliente: la tabla nueva de Contactos no puede
 * traer 200 filas de una. El filtro de archivados pasa a SQL (antes se
 * cortaba en JS después de traer 200 filas, lo que rompía la paginación).
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  );

  const db = getDb();
  const searchCondition = q
    ? or(
        ilike(schema.contact.name, `%${q}%`),
        ilike(schema.contact.phone, `%${q}%`)
      )
    : undefined;
  const archivedCondition = includeArchived
    ? undefined
    : isNull(schema.contact.archivedAt);

  const whereClause = scoped(
    schema.contact.organizationId,
    session.organizationId,
    searchCondition,
    archivedCondition
  );

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.contact)
      .where(whereClause)
      .orderBy(desc(schema.contact.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)` }).from(schema.contact).where(whereClause),
  ]);

  const contacts = rows.map(serializeContact);
  const total = Number(countRows[0]?.n ?? 0);
  return Response.json({ contacts, total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  notes: z.string().max(4000).optional(),
  // 005 (T017, DV-003) — la unicidad la resuelven los índices parciales +
  // el mapeo 409 de withAuth (ver src/lib/api.ts).
  email: z.string().trim().email().max(200).optional(),
  nationalId: z.string().trim().max(60).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // 003: la identidad WhatsApp se deriva del teléfono normalizado.
  const phone = normalizeMx(body.data.phone);
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone,
      waIdentity: phone,
      notes: body.data.notes ?? null,
      email: body.data.email ?? null,
      nationalId: body.data.nationalId ?? null,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.waIdentity],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }
  return Response.json(
    { contact: serializeContact(inserted[0]) },
    { status: 201 }
  );
});
