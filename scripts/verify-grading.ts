/**
 * Verificación manual de evaluación y certificados (010) contra la base real.
 *
 *   pnpm verify-grading
 *
 * Usa una cohorte finalizada real, crea evaluaciones, carga resultados,
 * comprueba la regla de aprobación y la emisión, y BORRA todo al final.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { issueCertificate, revokeCertificate, verifyCertificate } from "@/server/certificates";
import { cohortGrading, createAssessment, recordResults } from "@/server/grading";

const db = getDb();
const orgs = await db.select().from(schema.organization).limit(1);
const org = orgs[0];
if (!org) {
  // Mismo criterio que verify-billing.ts: sin organización se avisa y se sale,
  // en vez de reventar con un TypeError que no dice nada. `noUncheckedIndexedAccess`
  // está activo justamente para que esto no se resuelva con un `!`.
  console.error("[verify-grading] No hay organización en esta base.");
  await getSql().end();
  process.exit(1);
}

// Una cohorte con alumnos, para que la planilla tenga filas.
const cohorts = await db
  .select({ id: schema.cohort.id, name: schema.cohort.name })
  .from(schema.cohort)
  .limit(50);

let target: { id: string; name: string | null } | null = null;
for (const c of cohorts) {
  const n = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(eq(schema.enrollment.cohortId, c.id));
  if (n.length >= 3) {
    target = c;
    break;
  }
}
if (!target) {
  console.error("No hay cohorte con al menos 3 alumnos");
  await getSql().end();
  process.exit(1);
}

console.log(`\nCohorte: ${target.name} (${target.id})\n`);

const a1 = await createAssessment(org.id, target.id, { name: "Trabajo final (verif)" });
const a2 = await createAssessment(org.id, target.id, { name: "Parcial (verif)" });
if (!a1.ok || !a2.ok) {
  console.error("No se pudieron crear las evaluaciones");
  await getSql().end();
  process.exit(1);
}
console.log("Evaluaciones creadas: 2");

const inicial = await cohortGrading(org.id, target.id);
const alumnos = inicial!.students.slice(0, 3);
console.log(`Alumnos en la planilla: ${inicial!.students.length}`);
console.log(`Mínimo de asistencia: ${inicial!.minAttendancePct ?? "sin definir"}`);
console.log(
  `\nSin resultados cargados, los tres primeros están: ${alumnos.map((s) => s.state).join(", ")}`
);

// Alumno 0 aprueba todo · alumno 1 desaprueba una · alumno 2 queda a medias.
await recordResults(org.id, a1.data.id, [
  { enrollmentId: alumnos[0]!.enrollmentId, passed: true },
  { enrollmentId: alumnos[1]!.enrollmentId, passed: false },
  { enrollmentId: alumnos[2]!.enrollmentId, passed: true },
]);
await recordResults(org.id, a2.data.id, [
  { enrollmentId: alumnos[0]!.enrollmentId, passed: true },
  { enrollmentId: alumnos[1]!.enrollmentId, passed: true },
  // El alumno 2 queda SIN corregir a propósito.
]);

const tras = await cohortGrading(org.id, target.id);
console.log("\nTras cargar resultados:");
for (const s of tras!.students.slice(0, 3)) {
  console.log(
    `  ${s.contactName.padEnd(32)} ${s.state.padEnd(10)} ${s.reasons.join("; ") || "—"}`
  );
}

// Emisión: solo al aprobado.
const aprobado = tras!.students.find((s) => s.state === "aprobado");
const reprobado = tras!.students.find((s) => s.state === "reprobado");

if (reprobado) {
  const intento = await issueCertificate(org.id, reprobado.enrollmentId);
  console.log(
    `\nEmitir a un REPROBADO: ${intento.ok ? "PERMITIÓ (mal)" : `rechazado — ${intento.message}`}`
  );
}

if (aprobado) {
  const cert = await issueCertificate(org.id, aprobado.enrollmentId);
  if (cert.ok) {
    console.log(`Emitir a un APROBADO: ${cert.data.code}`);

    // FR-007: emitir de nuevo devuelve el MISMO.
    const otra = await issueCertificate(org.id, aprobado.enrollmentId);
    console.log(
      `  segunda emisión: ${otra.ok && otra.data.code === cert.data.code ? "mismo código — idempotente" : "CREÓ OTRO (mal)"}`
    );

    // Verificación pública: qué expone.
    const pub = await verifyCertificate(cert.data.code);
    console.log(`  verificación pública: ${pub?.student} — ${pub?.course} — válido=${pub?.valid}`);
    console.log(`  campos expuestos: ${Object.keys(pub ?? {}).join(", ")}`);

    // Anulación: sigue existiendo, pero inválido.
    await revokeCertificate(org.id, cert.data.id, { reason: "verificación" });
    const trasAnular = await verifyCertificate(cert.data.code);
    console.log(
      `  tras anular: existe=${Boolean(trasAnular)} válido=${trasAnular?.valid} (debe existir e inválido)`
    );
  } else {
    console.log(`Emitir a un APROBADO falló: ${cert.message}`);
  }
} else {
  console.log("\n(ningún alumno quedó aprobado: revisar la asistencia mínima)");
}

// Limpieza.
const ids = [a1.data.id, a2.data.id];
const enrollmentIds = alumnos.map((a) => a.enrollmentId);
// Constitución III — hasta la limpieza de un script pasa por `scoped()`. Un
// DELETE de dominio sin `organization_id` es el patrón que después alguien
// copia a una ruta, y ahí ya no es un script.
await db
  .delete(schema.certificate)
  .where(scoped(schema.certificate.organizationId, org.id, inArray(schema.certificate.enrollmentId, enrollmentIds)));
await db
  .delete(schema.assessmentResult)
  .where(scoped(schema.assessmentResult.organizationId, org.id, inArray(schema.assessmentResult.assessmentId, ids)));
await db
  .delete(schema.assessment)
  .where(scoped(schema.assessment.organizationId, org.id, inArray(schema.assessment.id, ids)));
console.log("\nDatos de prueba borrados.\n");

await getSql().end();
process.exit(0);
