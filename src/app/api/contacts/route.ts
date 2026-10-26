import { and, desc, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { condicionDeBusqueda } from "@/lib/contact-search-sql";
import {
  contactoNuevoCampos,
  exigirTelefonoOCorreo,
  identidadProvisional,
} from "@/lib/contact-identity";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { serializeContact } from "@/server/contacts";
import { buscarContactoDuplicado, respuestaDeDuplicado } from "@/server/contact-duplicates";
import { condicionDeTipo, tiposDeLaOrganizacion } from "@/server/contact-types";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  archived: z.string().optional(),
  // .catch(): query params de listado/paginación son tolerantes por diseño
  // (un page/pageSize inválido vuelve al default en vez de 422).
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE),
  // 046 US7 — lead / alumno activo / exalumno; otro valor = todos.
  tipo: z.enum(["lead", "alumno_activo", "exalumno"]).optional().catch(undefined),
});

/**
 * Iteración 3 (Parte C) — paginación real de servidor (page/pageSize), no
 * solo corte del array en el cliente: la tabla nueva de Contactos no puede
 * traer 200 filas de una. El filtro de archivados pasa a SQL (antes se
 * cortaba en JS después de traer 200 filas, lo que rompía la paginación).
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), listQuerySchema);
  if (!query.ok) return query.response;
  const { page, pageSize } = query.data;
  const q = query.data.q?.trim();
  const includeArchived = query.data.archived === "true";

  const db = getDb();
  // 2026-10-26 — Cada palabra en algún campo, sin tildes ni mayúsculas
  // ("Juan Pérez" = "perez juan"): la regla única de `src/lib/contact-search.ts`.
  // 2026-10-21 — un contacto sin teléfono se encuentra por su correo.
  const searchCondition = q
    ? condicionDeBusqueda(q, {
        texto: [schema.contact.firstName, schema.contact.lastName, schema.contact.email],
        telefono: schema.contact.phone,
      })
    : undefined;
  const archivedCondition = includeArchived
    ? undefined
    : isNull(schema.contact.archivedAt);

  /**
   * 046 US7 (FR-024) — El tipo sale de la derivación única del historial;
   * acá se aplica como un conjunto de ids en el WHERE, así la búsqueda, los
   * archivados y la paginación siguen en SQL.
   */
  const tipos = await tiposDeLaOrganizacion(session.organizationId);
  const tipo = query.data.tipo ?? null;
  const baseClause = scoped(
    schema.contact.organizationId,
    session.organizationId,
    searchCondition,
    archivedCondition
  );
  const whereClause = scoped(
    schema.contact.organizationId,
    session.organizationId,
    searchCondition,
    archivedCondition,
    condicionDeTipo(tipo, tipos)
  );
  const contar = async (condicion: SQL | undefined) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.contact)
      .where(condicion ? and(baseClause, condicion) : baseClause);
    return Number(r?.n ?? 0);
  };

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

  const contacts = rows.map((c) => ({ ...serializeContact(c), tipo: tipos.tipoDe(c.id) }));
  const total = Number(countRows[0]?.n ?? 0);
  const [todos, alumnos, exalumnos] = await Promise.all([
    contar(undefined),
    contar(condicionDeTipo("alumno_activo", tipos)),
    contar(condicionDeTipo("exalumno", tipos)),
  ]);
  return Response.json({
    contacts,
    total,
    page,
    pageSize,
    tipos: { todos, lead: todos - alumnos - exalumnos, alumno_activo: alumnos, exalumno: exalumnos },
  });
});

/**
 * 2026-10-21 — Teléfono O correo (al menos uno). Sin teléfono, el contacto
 * recibe una identidad provisional (`sinwa:<id>`, `src/lib/contact-identity.ts`)
 * que nunca se usa para mandar un WhatsApp.
 */
const createSchema = z
  .object({
    ...contactoNuevoCampos,
    notes: z.string().max(4000).optional(),
  })
  .superRefine(exigirTelefonoOCorreo);

export const POST = requireCapability(
  "contactos.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  // 003: la identidad WhatsApp se deriva del teléfono normalizado (ya
  // normalizado por el schema, igual que el correo, que va en minúsculas).
  // El duplicado se NOMBRA: 409 con el contacto que ya existe.
  const phone = body.data.phone ?? null;
  const email = body.data.email ?? null;
  const duplicado = await buscarContactoDuplicado(session.organizationId, { phone, email });
  if (duplicado) return respuestaDeDuplicado(duplicado);

  const db = getDb();
  const id = newId("contact");
  const inserted = await db
    .insert(schema.contact)
    .values({
      id,
      organizationId: session.organizationId,
      firstName: body.data.firstName,
      lastName: body.data.lastName ?? null,
      phone,
      waIdentity: phone ?? identidadProvisional(id),
      notes: body.data.notes ?? null,
      email,
      nationalId: body.data.nationalId ?? null,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.waIdentity],
    })
    .returning();
  if (!inserted[0]) {
    // Carrera: otro pedido lo creó entre el chequeo y el INSERT.
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }
  return Response.json(
    { contact: serializeContact(inserted[0]) },
    { status: 201 }
  );
});
