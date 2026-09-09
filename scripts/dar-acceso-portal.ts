/**
 * Habilita el portal del alumno para UNA inscripción, desde la línea de
 * comandos.
 *
 *   pnpm dar-acceso -- <correo-del-alumno>
 *
 * Existe por el mismo motivo que `reset-password.ts`: Vocero es self-hosted y
 * el dueño de la instancia tiene acceso a la base. Es la vía ordenada de
 * usarlo cuando todavía no hay una sesión de staff a mano —al levantar un
 * entorno nuevo, o al probar el portal contra datos reales.
 *
 * **No reemplaza al botón de la pantalla.** Usa exactamente la misma función
 * (`grantPortalAccess`), así que hereda su comportamiento: crea el acceso
 * primero y avisa después, y si el correo no sale entrega la contraseña igual
 * en vez de perderla (014).
 *
 * Solo corre contra la base que apunte DATABASE_URL. No expone nada por HTTP.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { grantPortalAccess } from "@/server/access";

const args = process.argv.slice(2).filter((a) => a !== "--");
const email = args[0]?.trim().toLowerCase();

if (!email) {
  console.error("Uso: pnpm dar-acceso -- <correo-del-alumno>");
  process.exit(1);
}

const orgs = await getDb()
  .select({ id: schema.organization.id })
  .from(schema.organization)
  .limit(1);
const org = orgs[0];
if (!org) {
  console.error("[dar-acceso] No hay organización en esta base.");
  await getSql().end();
  process.exit(1);
}

/**
 * Todo lo que toque datos corre dentro del alcance de la organización: la app
 * se conecta como `cadit_app`, que está SUJETO a RLS, y sin `app.current_org`
 * declarada toda consulta devuelve cero filas sin error.
 */
const salida = await withOrganizationScope(org.id, "cli:dar-acceso", async () => {
  /**
   * `getDb()` se pide ACÁ ADENTRO y no arriba: devuelve la transacción del
   * alcance en curso, que es la que declaró `app.current_org`. Un handle
   * tomado afuera consulta por fuera de esa transacción y RLS le devuelve
   * cero filas **sin ningún error** — la base parece vacía.
   */
  const db = getDb();

  const filas = await db
    .select({
      enrollmentId: schema.enrollment.id,
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      startDate: schema.cohort.startDate,
    })
    .from(schema.contact)
    .innerJoin(schema.enrollment, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(eq(schema.contact.email, email));

  if (filas.length === 0) {
    return { error: `No hay ninguna inscripción con el correo ${email}.` };
  }

  // Si tiene varias cursadas da lo mismo cuál se use: el acceso se otorga al
  // CONTACTO, y el portal después le muestra todas (015, FR-008).
  const elegida = filas[0]!;

  const yaTiene = await db
    .select({ id: schema.accountLink.id })
    .from(schema.accountLink)
    .where(
      and(
        eq(schema.accountLink.contactId, elegida.contactId),
        eq(schema.accountLink.kind, "alumno"),
        isNull(schema.accountLink.suspendedAt)
      )
    )
    .limit(1);

  const resultado = await grantPortalAccess(org.id, elegida.enrollmentId);
  if (!resultado.ok) {
    return { error: `${resultado.code}: ${resultado.message}` };
  }

  return {
    persona: `${elegida.firstName} ${elegida.lastName ?? ""}`.trim(),
    cursadas: filas.length,
    ejemplo: elegida.courseName ?? elegida.cohortName ?? "—",
    yaTenia: yaTiene.length > 0,
    ...resultado.data,
  };
});

if ("error" in salida && salida.error) {
  console.error(`[dar-acceso] ${salida.error}`);
  await getSql().end();
  process.exit(1);
}

const r = salida as Extract<typeof salida, { persona: string }>;
console.log(`\n  ${r.persona} — ${r.cursadas} cursada(s), p. ej. "${r.ejemplo}"`);
console.log(`  correo:      ${email}`);
if (r.existingAccount) {
  console.log("  contraseña:  la que ya usaba (la cuenta existía; no se tocó)");
} else {
  console.log(`  contraseña:  ${r.temporaryPassword}`);
}
if (r.emailError) {
  // Sin M365 configurado esto es lo esperado, y no es un fallo: el acceso
  // quedó creado y la contraseña está acá arriba.
  console.log(`  correo NO enviado: ${r.emailError}`);
}
if (r.yaTenia) {
  console.log("  (ya tenía acceso; se regeneró la contraseña)");
}
console.log("");

await getSql().end();
process.exit(0);
