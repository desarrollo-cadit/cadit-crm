import { eq, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import {
  campoDeDuplicado,
  mensajeDeDuplicado,
  type CampoDuplicado,
} from "@/lib/contact-identity";

/**
 * Contactos sin teléfono (2026-10-21) — ¿ya hay alguien con ese teléfono o
 * ese correo?
 *
 * Se pregunta ANTES de escribir para poder NOMBRAR al contacto que ya existe
 * (el 23505 de un índice único no dice quién es). Los índices únicos siguen
 * siendo la red de seguridad ante una carrera.
 *
 * - Teléfono: el `phone` de otro contacto, o su `wa_identity` (un contacto
 *   que llegó por WhatsApp y todavía no tiene `phone` cargado igual "es" ese
 *   número).
 * - Correo: sin mayúsculas (`lower(email)`). Lo que se guarda ya va en
 *   minúsculas, pero puede quedar algún correo viejo sin normalizar (ver
 *   `drizzle/0068_correo_de_licencia.sql`).
 * - 2026-10-26 — Correo secundario: un correo (principal o secundario) que
 *   otro contacto ya usa como principal O como secundario es un duplicado.
 *   La regla vale en las dos direcciones, así que un mismo correo nunca
 *   apunta a dos personas.
 */

export type ContactoDuplicado = {
  campo: CampoDuplicado;
  contacto: { id: string; name: string };
};

/** ¿Algún contacto usa `correo` (ya normalizado) como principal o secundario? */
export function condicionDeCorreoTomado(correo: string): SQL {
  const c = correo.toLowerCase();
  return or(
    sql`lower(${schema.contact.email}) = ${c}`,
    eq(schema.contact.secondaryEmail, c)
  ) as SQL;
}

export async function buscarContactoDuplicado(
  organizationId: string,
  datos: {
    phone?: string | null;
    email?: string | null;
    secondaryEmail?: string | null;
    excluirId?: string;
  }
): Promise<ContactoDuplicado | null> {
  const db = getDb();
  const otro = datos.excluirId ? ne(schema.contact.id, datos.excluirId) : undefined;
  const columnas = {
    id: schema.contact.id,
    firstName: schema.contact.firstName,
    lastName: schema.contact.lastName,
  };

  if (datos.phone) {
    const rows = await db
      .select(columnas)
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          organizationId,
          or(eq(schema.contact.phone, datos.phone), eq(schema.contact.waIdentity, datos.phone)),
          otro
        )
      )
      .limit(1);
    if (rows[0]) return { campo: "telefono", contacto: { id: rows[0].id, name: fullName(rows[0]) } };
  }

  const correos: [CampoDuplicado, string | null | undefined][] = [
    ["correo", datos.email],
    ["correo_secundario", datos.secondaryEmail],
  ];
  for (const [campo, correo] of correos) {
    if (!correo) continue;
    const rows = await db
      .select(columnas)
      .from(schema.contact)
      .where(
        scoped(schema.contact.organizationId, organizationId, condicionDeCorreoTomado(correo), otro)
      )
      .limit(1);
    if (rows[0]) return { campo, contacto: { id: rows[0].id, name: fullName(rows[0]) } };
  }

  return null;
}

/**
 * 409 que nombra al contacto existente y lleva su id: la pantalla puede
 * enlazarlo u ofrecer "usar ese contacto".
 */
export function respuestaDeDuplicado(d: ContactoDuplicado): Response {
  return Response.json(
    {
      error: {
        code: "duplicate",
        message: mensajeDeDuplicado(d.campo, d.contacto.name),
        field: campoDeDuplicado(d.campo),
        contact: d.contacto,
      },
    },
    { status: 409 }
  );
}
