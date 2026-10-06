import { asc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 2026-10-06 (decisiones del dueño) — Vendedores, para pagar comisiones.
 *
 * Un vendedor es una entidad propia y no un usuario del panel: hay quien vende
 * sin entrar nunca al sistema. No se borra: se archiva, y el archivado deja de
 * ofrecerse para ventas nuevas pero sigue en las que hizo.
 */

export type SellerDto = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  archived: boolean;
  createdAt: string;
};

export type SellerResult =
  | { ok: true; seller: SellerDto }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

export const VENDEDOR_OBLIGATORIO =
  "Falta indicar el vendedor. Toda inscripción en una cohorte es una venta, y para pagar la comisión hace falta saber quién la hizo.";

/**
 * Qué inscripción es una VENTA y por lo tanto lleva vendedor.
 *
 * - Con cohorte: sí. Sin cohorte es un lead de interés y todavía no se vendió
 *   nada.
 * - La hija de una especialización (`parentEnrollmentId`): no. La venta es la
 *   madre, que lleva el paquete; pedirle vendedor a cada módulo sería contar
 *   la misma venta varias veces.
 */
export function exigeVendedor(e: {
  cohortId: string | null;
  parentEnrollmentId: string | null;
}): boolean {
  return e.cohortId !== null && e.parentEnrollmentId === null;
}

/**
 * La regla al EDITAR una inscripción que ya existe. Devuelve el motivo del
 * rechazo, o `null` si se puede guardar.
 *
 * Una venta vieja sin vendedor NO se bloquea: obligar a cargarlo para corregir
 * un número de factura sería sorprender a quien sólo vino a eso. Lo que no se
 * permite es QUITARLE el vendedor a una venta que ya lo tiene: ese es el dato
 * con el que se paga la comisión.
 */
export function reglaDeVendedorAlEditar(input: {
  exige: boolean;
  actual: string | null;
  nuevo: string | null | undefined;
}): string | null {
  if (input.nuevo === undefined) return null;
  if (input.nuevo === null && input.exige && input.actual !== null) {
    return "Esta inscripción es una venta y ya tiene vendedor: se puede cambiar por otro, pero no dejar vacío.";
  }
  return null;
}

/**
 * Que el vendedor exista en la organización y esté ACTIVO. Devuelve el motivo
 * del rechazo, o `null`.
 *
 * Se usa al elegir un vendedor para una venta. Conservar el vendedor que una
 * venta vieja ya tenía —aunque hoy esté archivado— no pasa por acá: quien
 * llama sólo verifica cuando el vendedor CAMBIA.
 */
export async function verificarVendedorParaVenta(
  organizationId: string,
  sellerId: string
): Promise<string | null> {
  const rows = await getDb()
    .select({ id: schema.seller.id, archivedAt: schema.seller.archivedAt })
    .from(schema.seller)
    .where(scoped(schema.seller.organizationId, organizationId, eq(schema.seller.id, sellerId)))
    .limit(1);
  const fila = rows[0];
  if (!fila) return "Ese vendedor no existe en la organización.";
  if (fila.archivedAt) {
    return "Ese vendedor está archivado y ya no se puede elegir para una venta nueva.";
  }
  return null;
}

function toDto(row: typeof schema.seller.$inferSelect): SellerDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    userId: row.userId,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Todos los vendedores, activos primero y por nombre. */
export async function listSellers(organizationId: string): Promise<SellerDto[]> {
  const rows = await getDb()
    .select()
    .from(schema.seller)
    .where(scoped(schema.seller.organizationId, organizationId))
    .orderBy(sql`${schema.seller.archivedAt} is not null`, asc(schema.seller.name));
  return rows.map(toDto);
}

export type SellerInput = {
  name: string;
  email?: string | null;
  userId?: string | null;
};

const limpiar = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/**
 * Dos vendedores ACTIVOS con el mismo nombre parten el reporte en dos grupos
 * que nadie distingue. Entre archivados no importa: "Ana" puede volver a
 * venderle a la academia años después.
 */
async function nombreOcupado(
  organizationId: string,
  name: string,
  exceptoId: string | null
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.seller.id })
    .from(schema.seller)
    .where(
      scoped(
        schema.seller.organizationId,
        organizationId,
        sql`lower(${schema.seller.name}) = lower(${name})`,
        isNull(schema.seller.archivedAt),
        exceptoId ? ne(schema.seller.id, exceptoId) : undefined
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function esMiembro(organizationId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

const NOMBRE_DUPLICADO: SellerResult = {
  ok: false,
  status: 409,
  code: "duplicate",
  message: "Ya hay un vendedor activo con ese nombre.",
};

const NO_ES_MIEMBRO: SellerResult = {
  ok: false,
  status: 422,
  code: "invalid_body",
  message: "Esa cuenta no pertenece al equipo de la organización.",
};

export async function createSeller(
  organizationId: string,
  input: SellerInput
): Promise<SellerResult> {
  const name = limpiar(input.name);
  if (!name || name.length > 120) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "El nombre del vendedor es obligatorio (hasta 120 caracteres).",
    };
  }
  if (await nombreOcupado(organizationId, name, null)) return NOMBRE_DUPLICADO;

  const userId = limpiar(input.userId);
  if (userId && !(await esMiembro(organizationId, userId))) return NO_ES_MIEMBRO;

  const inserted = await getDb()
    .insert(schema.seller)
    .values({
      id: newId("seller"),
      organizationId,
      name,
      email: limpiar(input.email),
      userId,
    })
    .returning();
  return { ok: true, seller: toDto(inserted[0]!) };
}

/**
 * Edita y archiva. `archived: true` pone la fecha; `false` lo reactiva. No hay
 * borrado: un vendedor borrado convertiría sus ventas en "Sin vendedor".
 */
export async function updateSeller(
  organizationId: string,
  sellerId: string,
  input: Partial<SellerInput & { archived: boolean }>
): Promise<SellerResult> {
  const db = getDb();
  const actuales = await db
    .select({
      id: schema.seller.id,
      name: schema.seller.name,
      archivedAt: schema.seller.archivedAt,
    })
    .from(schema.seller)
    .where(scoped(schema.seller.organizationId, organizationId, eq(schema.seller.id, sellerId)))
    .limit(1);
  const actual = actuales[0];
  if (!actual) {
    return { ok: false, status: 404, code: "not_found", message: "Vendedor no encontrado" };
  }

  const set: Partial<typeof schema.seller.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = limpiar(input.name);
    if (!name || name.length > 120) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "El nombre del vendedor es obligatorio (hasta 120 caracteres).",
      };
    }
    set.name = name;
  }
  if (input.email !== undefined) set.email = limpiar(input.email);
  if (input.archived !== undefined) set.archivedAt = input.archived ? new Date() : null;

  // Queda activo con este nombre: no puede chocar con otro activo.
  const quedaActivo = input.archived !== undefined ? !input.archived : actual.archivedAt === null;
  const nombreFinal = set.name ?? actual.name;
  if (quedaActivo && (set.name !== undefined || input.archived === false)) {
    if (await nombreOcupado(organizationId, nombreFinal, sellerId)) return NOMBRE_DUPLICADO;
  }

  if (input.userId !== undefined) {
    const userId = limpiar(input.userId);
    if (userId && !(await esMiembro(organizationId, userId))) return NO_ES_MIEMBRO;
    set.userId = userId;
  }

  const updated = await db
    .update(schema.seller)
    .set(set)
    .where(scoped(schema.seller.organizationId, organizationId, eq(schema.seller.id, sellerId)))
    .returning();
  const fila = updated[0];
  if (!fila) {
    return { ok: false, status: 404, code: "not_found", message: "Vendedor no encontrado" };
  }
  return { ok: true, seller: toDto(fila) };
}
