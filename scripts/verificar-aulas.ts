/**
 * Comprobación de solo lectura de la 023 contra la base que apunte
 * DATABASE_URL: que las aulas se listen, que el detector corra y que la
 * agenda responda. No escribe nada.
 *
 *   pnpm verificar-aulas
 */
import { eq } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { detectClashes, listVirtualRooms, roomAgenda } from "@/server/virtual-rooms";

const orgs = await getDb()
  .select({ id: schema.organization.id, name: schema.organization.name })
  .from(schema.organization)
  .limit(1);
const org = orgs[0];
if (!org) {
  console.error("No hay organización.");
  await getSql().end();
  process.exit(1);
}

await withOrganizationScope(org.id, "cli:verificar-aulas", async () => {
  const rooms = await listVirtualRooms(org.id);
  console.log(`\n  organización: ${org.name}`);
  console.log(`  aulas cargadas: ${rooms.length}`);
  for (const r of rooms) {
    console.log(`    · ${r.name} — ${r.cohortCount} cohorte(s)${r.archivedAt ? " [de baja]" : ""}`);
  }

  const clashes = await detectClashes(org.id);
  console.log(`  choques detectados: ${clashes.length}`);
  for (const c of clashes.slice(0, 5)) {
    console.log(`    · ${c.roomName}: ${c.cohortName} vs ${c.otherCohortName}`);
  }

  const desde = new Date();
  const agenda = await roomAgenda(org.id, desde, new Date(desde.getTime() + 7 * 86_400_000));
  console.log(`  clases con aula en los próximos 7 días: ${agenda.length}`);

  const clases = await getDb()
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(eq(schema.classSession.organizationId, org.id));
  console.log(`  clases totales en la base: ${clases.length}`);
  if (clases.length === 0) {
    console.log("\n  (sin cronograma generado todavía: por eso agenda y choques dan 0)");
  }
  console.log("");
});

await getSql().end();
process.exit(0);
