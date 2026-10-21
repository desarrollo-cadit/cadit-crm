import { eq, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { mensajeDeDuplicado, type CampoDuplicado } from "@/lib/contact-identity";

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
 */

export type ContactoDuplicado = {
  campo: CampoDuplicado;
  contacto: { id: string; name: string };
};

export async function buscarContactoDuplicado(
  organizationId: string,
  datos: { phone?: string | null; email?: string | null; excluirId?: string }
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

  if (datos.email) {
    const rows = await db
      .select(columnas)
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          organizationId,
          sql`lower(${schema.contact.email}) = ${datos.email.toLowerCase()}`,
          otro
        )
      )
      .limit(1);
    if (rows[0]) return { campo: "correo", contacto: { id: rows[0].id, name: fullName(rows[0]) } };
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
        field: d.campo === "correo" ? "email" : "phone",
        contact: d.contacto,
      },
    },
    { status: 409 }
  );
}
