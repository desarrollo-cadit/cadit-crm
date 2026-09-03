/**
 * Camada de demostración: crea UNA camada completa para recorrer el producto
 * entero —alumno, profesor y gestión— y después la borra sin dejar rastro.
 *
 *   pnpm demo-camada -- crear
 *   pnpm demo-camada -- estado
 *   pnpm demo-camada -- borrar
 *
 * ============================================================
 * POR QUÉ EXISTE, Y POR QUÉ LA BAJA NO ES UN EXTRA
 * ============================================================
 * El producto está construido pero la base real está vacía: 0 clases, 0
 * cuotas, 0 licencias. Así no se puede ver si el circuito cierra, y "lo
 * pruebo con datos reales" termina en datos de prueba mezclados con los 340
 * alumnos de verdad, imposibles de distinguir seis meses después.
 *
 * Por eso todo lo que este script crea lleva el prefijo `[DEMO]` en el nombre
 * y **cuelga de UNA camada**. `borrar` recorre esa camada y elimina lo suyo en
 * orden de dependencias, y después VERIFICA que no quedó nada. Si algo queda,
 * lo dice y sale distinto de cero: una baja que informa éxito sin haber
 * borrado es peor que no tener baja.
 *
 * Lo que NO toca, nunca: contactos, camadas, cursos, profesores y pagos que no
 * lleven el prefijo. La selección es por marca explícita, no por fecha ni por
 * "los últimos": borrar por heurística es cómo se pierde un dato real.
 */

import { and, eq, inArray, like } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { scoped } from "@/lib/db/tenant";
import { createCohort, createCourse } from "@/server/courses";
import { createEnrollment } from "@/server/enrollments";
import { createTeacher } from "@/server/teachers";
import { generateSchedule, markAttendance } from "@/server/attendance";
import { createAssessment, recordResults } from "@/server/grading";
import { generateInstallmentPlan, recordPayment } from "@/server/billing";
import { assignLicense } from "@/server/licenses";
import { createAnnouncement, createResource } from "@/server/resources";
import { grantPortalAccess, grantTeacherPortalAccess } from "@/server/access";
import { createVirtualRoom } from "@/server/virtual-rooms";
import { newId } from "@/lib/db/ids";

/** La marca. Todo lo del demo la lleva, y la baja solo mira esto. */
const MARCA = "[DEMO]";
const CORREO_ALUMNO = "alumno.demo@ejemplo.test";
const CORREO_PROFESOR = "profesor.demo@ejemplo.test";
/** Teléfonos fuera de todo rango real, para no chocar con un contacto vivo. */
const TEL_ALUMNO = "59899000001";

const accion = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "estado";
if (!["crear", "borrar", "estado"].includes(accion)) {
  console.error("Uso: pnpm demo-camada -- <crear|borrar|estado>");
  process.exit(1);
}

const orgs = await getDb()
  .select({ id: schema.organization.id, name: schema.organization.name })
  .from(schema.organization)
  .limit(1);
const org = orgs[0];
if (!org) {
  console.error("[demo] No hay organización en esta base.");
  await getSql().end();
  process.exit(1);
}

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);
const soloFecha = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/* ============================================================
 * Qué hay hoy
 * ============================================================ */

async function estado() {
  const db = getDb();

  const cohorts = await db
    .select({ id: schema.cohort.id, name: schema.cohort.name })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, org!.id, like(schema.cohort.name, `${MARCA}%`)));

  if (cohorts.length === 0) {
    console.log("\n  No hay camada de demostración cargada.\n");
    return { cohorts: [] as { id: string; name: string | null }[] };
  }

  for (const c of cohorts) {
    const [clases, insc, evals, cuotas, pagos, lic, mat, avisos] = await Promise.all([
      db
        .select({ id: schema.classSession.id })
        .from(schema.classSession)
        .where(scoped(schema.classSession.organizationId, org!.id, eq(schema.classSession.cohortId, c.id))),
      db
        .select({ id: schema.enrollment.id })
        .from(schema.enrollment)
        .where(scoped(schema.enrollment.organizationId, org!.id, eq(schema.enrollment.cohortId, c.id))),
      db
        .select({ id: schema.assessment.id })
        .from(schema.assessment)
        .where(scoped(schema.assessment.organizationId, org!.id, eq(schema.assessment.cohortId, c.id))),
      db
        .select({ id: schema.installment.id })
        .from(schema.installment)
        .where(scoped(schema.installment.organizationId, org!.id)),
      db
        .select({ id: schema.payment.id })
        .from(schema.payment)
        .where(scoped(schema.payment.organizationId, org!.id)),
      db
        .select({ id: schema.license.id })
        .from(schema.license)
        .where(scoped(schema.license.organizationId, org!.id)),
      db
        .select({ id: schema.resource.id })
        .from(schema.resource)
        .where(scoped(schema.resource.organizationId, org!.id, like(schema.resource.title, `${MARCA}%`))),
      db
        .select({ id: schema.announcement.id })
        .from(schema.announcement)
        .where(scoped(schema.announcement.organizationId, org!.id, eq(schema.announcement.cohortId, c.id))),
    ]);

    console.log(`\n  ${c.name}`);
    console.log(`    clases ${clases.length} · inscripciones ${insc.length} · evaluaciones ${evals.length}`);
    console.log(`    cuotas ${cuotas.length} · pagos ${pagos.length} · licencias ${lic.length}`);
    console.log(`    material ${mat.length} · avisos ${avisos.length}\n`);
  }
  return { cohorts };
}

/* ============================================================
 * Crear
 * ============================================================ */

async function crear() {
  const db = getDb();

  const yaHay = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, org!.id, like(schema.cohort.name, `${MARCA}%`)))
    .limit(1);
  if (yaHay.length > 0) {
    console.error("[demo] Ya existe una camada de demostración. Borrala primero:");
    console.error("       pnpm demo-camada -- borrar");
    return false;
  }

  const staff = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, org!.id))
    .limit(1);
  const autorUserId = staff[0]?.userId ?? null;

  const paso = (n: string, ok: boolean, extra = "") =>
    console.log(`  ${ok ? "OK  " : "FALLA"} ${n}${extra ? ` — ${extra}` : ""}`);

  /* -- El aula virtual ------------------------------------- */
  const aula = await createVirtualRoom(org!.id, {
    name: `${MARCA} Sala de prueba`,
    url: "https://zoom.us/j/00000000000",
    accountEmail: "demo@ejemplo.test",
    notes: "Creada por pnpm demo-camada. Se borra con `borrar`.",
  });
  paso("aula virtual", aula.ok);
  if (!aula.ok) return false;

  /* -- El profesor ----------------------------------------- */
  const teacherId = await createTeacher(org!.id, {
    name: `${MARCA} Profesora Demo`,
    email: CORREO_PROFESOR,
    title: "Arquitecta",
  });
  paso("profesor", true, teacherId);

  /* -- Curso y camada -------------------------------------- */
  const curso = await createCourse(org!.id, { name: `${MARCA} Curso de prueba` });
  paso("curso", curso.ok);
  if (!curso.ok) return false;

  /**
   * La camada arranca HACE tres semanas y termina en tres: así hay clases
   * pasadas (con asistencia y grabación) y futuras (con "entrar a la clase").
   * Un demo que solo tiene futuro no muestra la mitad del producto.
   */
  const inicio = soloFecha(dias(-21));
  const fin = soloFecha(dias(21));
  const cohorte = await createCohort(org!.id, {
    courseId: curso.id,
    name: `${MARCA} Camada de prueba`,
    startDate: inicio,
    endDate: fin,
    teacherId,
    // Lunes y miércoles, para que el cronograma tenga varias clases.
    daysOfWeek: "0,2",
    startTime: "18:30",
    endTime: "20:30",
    frequency: "Lunes y miércoles de 18:30 a 20:30",
    classroom: "Aula demo",
    minAttendancePct: 75,
    capacity: 10,
    cost: 24000,
    currency: "UYU",
    virtualRoomId: aula.data.id,
  });
  paso("camada", cohorte.ok);
  if (!cohorte.ok) return false;
  const cohortId = cohorte.id;

  /* -- El alumno ------------------------------------------- */
  const insc = await createEnrollment(org!.id, {
    cohortId,
    contact: {
      firstName: `${MARCA} Alumno`,
      lastName: "Demo",
      phone: TEL_ALUMNO,
      email: CORREO_ALUMNO,
    },
    amount: 24000,
    currency: "UYU",
    installments: 4,
  });
  paso("inscripción", insc.ok);
  if (!insc.ok) return false;
  const enrollmentId = insc.enrollment.id;

  /**
   * `createEnrollment` pone `enrolled_at` = HOY, y está bien para el alta
   * real. Acá no: la camada arrancó hace tres semanas, así que con la fecha de
   * hoy las siete clases pasadas quedan fuera del cálculo de asistencia —"el
   * que entra en la cuarta semana no arranca con tres semanas de faltas"
   * (009)— y el demo mostraría 0%.
   *
   * Se retrasa un día antes del inicio, que es lo que pasa de verdad: el
   * alumno se inscribe ANTES de que empiece.
   */
  await db
    .update(schema.enrollment)
    .set({ enrolledAt: soloFecha(dias(-22)) })
    .where(scoped(schema.enrollment.organizationId, org!.id, eq(schema.enrollment.id, enrollmentId)));

  /* -- El cronograma: lo que destraba todo lo demás -------- */
  const crono = await generateSchedule(org!.id, cohortId);
  paso("cronograma", crono.ok, crono.ok ? `${crono.data.length} clases` : crono.message);
  if (!crono.ok) return false;

  const clases = await db
    .select()
    .from(schema.classSession)
    .where(scoped(schema.classSession.organizationId, org!.id, eq(schema.classSession.cohortId, cohortId)));
  const ahora = Date.now();
  const pasadas = clases.filter((c) => c.date.getTime() < ahora).sort((a, b) => a.number - b.number);
  const futuras = clases.filter((c) => c.date.getTime() >= ahora).sort((a, b) => a.number - b.number);

  /* -- Asistencia de las clases pasadas -------------------- */
  const patron = ["presente", "presente", "ausente", "presente", "tarde", "presente"] as const;
  let marcadas = 0;
  for (const [i, c] of pasadas.entries()) {
    const r = await markAttendance(
      org!.id,
      c.id,
      [{ enrollmentId, status: patron[i % patron.length]! }],
      autorUserId
    );
    if (r.ok) marcadas++;
  }
  paso("asistencia", marcadas === pasadas.length, `${marcadas} de ${pasadas.length} clases pasadas`);

  /* -- Una grabación en la primera clase pasada ------------ */
  if (pasadas[0]) {
    await db
      .update(schema.classSession)
      .set({ recordingUrl: "https://drive.google.com/file/d/demo/view", updatedAt: new Date() })
      .where(
        scoped(schema.classSession.organizationId, org!.id, eq(schema.classSession.id, pasadas[0].id))
      );
    paso("grabación de la clase 1", true);
  }

  /* -- Evaluaciones: una corregida y otra sin corregir ----- */
  const evalA = await createAssessment(org!.id, cohortId, {
    name: `${MARCA} Trabajo práctico 1`,
    required: true,
  });
  const evalB = await createAssessment(org!.id, cohortId, {
    name: `${MARCA} Entrega final`,
    required: true,
  });
  paso("evaluaciones", evalA.ok && evalB.ok);
  if (evalA.ok) {
    // La segunda queda SIN corregir a propósito: es el caso que el portal
    // tiene que mostrar como "pendiente" y jamás como desaprobada (FR-005).
    const r = await recordResults(org!.id, evalA.data.id, [{ enrollmentId, passed: true }], autorUserId);
    paso("resultado de la primera", r.ok);
  }

  /* -- Cobranza: dos cuotas pagas, dos por vencer ---------- */
  const plan = await generateInstallmentPlan(org!.id, enrollmentId, {
    count: 4,
    firstDueDate: soloFecha(dias(-20)),
  });
  paso("plan de cuotas", plan.ok, plan.ok ? `${plan.data.length} cuotas` : plan.message);
  if (plan.ok) {
    let pagos = 0;
    for (const cuota of plan.data.slice(0, 2)) {
      const r = await recordPayment(org!.id, enrollmentId, {
        installmentId: cuota.id,
        amount: cuota.amount,
        paidAt: dias(-18),
        method: "transferencia",
        receiptNumber: `${MARCA}-${cuota.number}`,
        recordedBy: autorUserId,
      });
      if (r.ok) pagos++;
    }
    paso("pagos", pagos === 2, `${pagos} cuotas pagas, 2 pendientes`);
  }

  /* -- Licencia de software -------------------------------- */
  const softwareId = newId("software");
  await db.insert(schema.software).values({
    id: softwareId,
    organizationId: org!.id,
    name: `${MARCA} AutoCAD demo`,
    totalLicenses: 5,
  });
  const lic = await assignLicense(org!.id, enrollmentId, softwareId);
  paso("licencia", lic.ok);

  /* -- Material y aviso ------------------------------------ */
  const mat = await createResource(org!.id, {
    courseId: curso.id,
    title: `${MARCA} Guía de la clase 1`,
    url: "https://ejemplo.test/guia-demo.pdf",
    kind: "guia",
  });
  paso("material del curso", mat.ok);

  if (autorUserId) {
    const av = await createAnnouncement(org!.id, cohortId, autorUserId, {
      title: `${MARCA} Traigan el plano acotado`,
      body: "El lunes arrancamos con el render, así que necesitamos el plano ya acotado.",
    });
    paso("aviso de la camada", av.ok);
  }

  /* -- Accesos al portal ----------------------------------- */
  const accesoAlumno = await grantPortalAccess(org!.id, enrollmentId);
  paso("acceso del alumno", accesoAlumno.ok);
  const accesoProfesor = await grantTeacherPortalAccess(org!.id, teacherId);
  paso("acceso del profesor", accesoProfesor.ok);

  console.log("\n  ── Para entrar ───────────────────────────────");
  console.log(`  alumno    ${CORREO_ALUMNO}`);
  if (accesoAlumno.ok) {
    console.log(`            ${accesoAlumno.data.temporaryPassword ?? "(la cuenta ya existía)"}`);
  }
  console.log(`  profesor  ${CORREO_PROFESOR}`);
  if (accesoProfesor.ok) {
    console.log(`            ${accesoProfesor.data.temporaryPassword ?? "(la cuenta ya existía)"}`);
  }
  console.log(`\n  clases: ${clases.length} (${pasadas.length} pasadas, ${futuras.length} por venir)`);
  console.log("  Para borrarlo todo:  pnpm demo-camada -- borrar\n");
  return true;
}

/* ============================================================
 * Borrar
 * ============================================================ */

/**
 * El orden importa: las claves foráneas van de las hojas al tronco, y
 * `enrollment.cohort_id` es `restrict` —la camada no se borra mientras haya
 * una inscripción colgando—.
 *
 * Se borra explícitamente incluso lo que el `cascade` se llevaría solo. No es
 * redundancia: es lo que permite CONTAR lo eliminado y verificar después, y
 * lo que evita depender de que el esquema no cambie.
 */
async function borrar() {
  const db = getDb();
  const borrado: Record<string, number> = {};
  const contar = (k: string, n: number) => {
    borrado[k] = (borrado[k] ?? 0) + n;
  };

  const cohorts = await db
    .select({ id: schema.cohort.id, courseId: schema.cohort.courseId, teacherId: schema.cohort.teacherId })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, org!.id, like(schema.cohort.name, `${MARCA}%`)));

  if (cohorts.length === 0) {
    console.log("\n  No hay nada de demostración para borrar.\n");
    return true;
  }

  const cohortIds = cohorts.map((c) => c.id);
  const courseIds = [...new Set(cohorts.map((c) => c.courseId))];
  const teacherIds = [...new Set(cohorts.map((c) => c.teacherId).filter((t): t is string => Boolean(t)))];

  const enrollments = await db
    .select({ id: schema.enrollment.id, contactId: schema.enrollment.contactId })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, org!.id, inArray(schema.enrollment.cohortId, cohortIds)));
  const enrollmentIds = enrollments.map((e) => e.id);
  const contactIds = [...new Set(enrollments.map((e) => e.contactId))];

  const clases = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(scoped(schema.classSession.organizationId, org!.id, inArray(schema.classSession.cohortId, cohortIds)));
  const claseIds = clases.map((c) => c.id);

  const evals = await db
    .select({ id: schema.assessment.id })
    .from(schema.assessment)
    .where(scoped(schema.assessment.organizationId, org!.id, inArray(schema.assessment.cohortId, cohortIds)));
  const evalIds = evals.map((e) => e.id);

  /* -- Hojas primero --------------------------------------- */
  if (enrollmentIds.length) {
    const pagos = await db
      .delete(schema.payment)
      .where(scoped(schema.payment.organizationId, org!.id, inArray(schema.payment.enrollmentId, enrollmentIds)))
      .returning({ id: schema.payment.id });
    contar("pagos", pagos.length);

    const cuotas = await db
      .delete(schema.installment)
      .where(scoped(schema.installment.organizationId, org!.id, inArray(schema.installment.enrollmentId, enrollmentIds)))
      .returning({ id: schema.installment.id });
    contar("cuotas", cuotas.length);

    const lic = await db
      .delete(schema.license)
      .where(scoped(schema.license.organizationId, org!.id, inArray(schema.license.enrollmentId, enrollmentIds)))
      .returning({ id: schema.license.id });
    contar("licencias", lic.length);

    const cert = await db
      .delete(schema.certificate)
      .where(scoped(schema.certificate.organizationId, org!.id, inArray(schema.certificate.enrollmentId, enrollmentIds)))
      .returning({ id: schema.certificate.id });
    contar("certificados", cert.length);

    const att = await db
      .delete(schema.attendance)
      .where(scoped(schema.attendance.organizationId, org!.id, inArray(schema.attendance.enrollmentId, enrollmentIds)))
      .returning({ id: schema.attendance.id });
    contar("asistencia", att.length);
  }

  if (evalIds.length) {
    const res = await db
      .delete(schema.assessmentResult)
      .where(scoped(schema.assessmentResult.organizationId, org!.id, inArray(schema.assessmentResult.assessmentId, evalIds)))
      .returning({ id: schema.assessmentResult.id });
    contar("resultados", res.length);

    const ev = await db
      .delete(schema.assessment)
      .where(scoped(schema.assessment.organizationId, org!.id, inArray(schema.assessment.id, evalIds)))
      .returning({ id: schema.assessment.id });
    contar("evaluaciones", ev.length);
  }

  /* -- Material: el de las clases y el marcado del curso ---- */
  if (claseIds.length) {
    const r = await db
      .delete(schema.resource)
      .where(scoped(schema.resource.organizationId, org!.id, inArray(schema.resource.classSessionId, claseIds)))
      .returning({ id: schema.resource.id });
    contar("material", r.length);
  }
  const matCurso = await db
    .delete(schema.resource)
    .where(scoped(schema.resource.organizationId, org!.id, like(schema.resource.title, `${MARCA}%`)))
    .returning({ id: schema.resource.id });
  contar("material", matCurso.length);

  const avisos = await db
    .delete(schema.announcement)
    .where(scoped(schema.announcement.organizationId, org!.id, inArray(schema.announcement.cohortId, cohortIds)))
    .returning({ id: schema.announcement.id });
  contar("avisos", avisos.length);

  if (claseIds.length) {
    const cls = await db
      .delete(schema.classSession)
      .where(scoped(schema.classSession.organizationId, org!.id, inArray(schema.classSession.id, claseIds)))
      .returning({ id: schema.classSession.id });
    contar("clases", cls.length);
  }

  /* -- Accesos al portal, y las cuentas que se crearon ------ */
  const links = await db
    .delete(schema.accountLink)
    .where(
      and(
        eq(schema.accountLink.organizationId, org!.id),
        contactIds.length
          ? inArray(schema.accountLink.contactId, contactIds)
          : eq(schema.accountLink.contactId, "__ninguno__")
      )
    )
    .returning({ userId: schema.accountLink.userId });
  const linksProfe = teacherIds.length
    ? await db
        .delete(schema.accountLink)
        .where(
          and(
            eq(schema.accountLink.organizationId, org!.id),
            inArray(schema.accountLink.teacherId, teacherIds)
          )
        )
        .returning({ userId: schema.accountLink.userId })
    : [];
  contar("accesos al portal", links.length + linksProfe.length);

  const userIds = [...new Set([...links, ...linksProfe].map((l) => l.userId))];
  if (userIds.length) {
    // Better Auth: la sesión y la credencial cuelgan del usuario.
    await db.delete(schema.session).where(inArray(schema.session.userId, userIds));
    await db.delete(schema.account).where(inArray(schema.account.userId, userIds));
    const us = await db
      .delete(schema.user)
      .where(inArray(schema.user.id, userIds))
      .returning({ id: schema.user.id });
    contar("cuentas de usuario", us.length);
  }

  /* -- Tronco ---------------------------------------------- */
  if (enrollmentIds.length) {
    const e = await db
      .delete(schema.enrollment)
      .where(scoped(schema.enrollment.organizationId, org!.id, inArray(schema.enrollment.id, enrollmentIds)))
      .returning({ id: schema.enrollment.id });
    contar("inscripciones", e.length);
  }
  if (contactIds.length) {
    const c = await db
      .delete(schema.contact)
      .where(scoped(schema.contact.organizationId, org!.id, inArray(schema.contact.id, contactIds)))
      .returning({ id: schema.contact.id });
    contar("contactos", c.length);
  }

  const coh = await db
    .delete(schema.cohort)
    .where(scoped(schema.cohort.organizationId, org!.id, inArray(schema.cohort.id, cohortIds)))
    .returning({ id: schema.cohort.id });
  contar("camadas", coh.length);

  const cur = await db
    .delete(schema.course)
    .where(scoped(schema.course.organizationId, org!.id, inArray(schema.course.id, courseIds)))
    .returning({ id: schema.course.id });
  contar("cursos", cur.length);

  if (teacherIds.length) {
    const t = await db
      .delete(schema.teacher)
      .where(scoped(schema.teacher.organizationId, org!.id, inArray(schema.teacher.id, teacherIds)))
      .returning({ id: schema.teacher.id });
    contar("profesores", t.length);
  }

  const sw = await db
    .delete(schema.software)
    .where(scoped(schema.software.organizationId, org!.id, like(schema.software.name, `${MARCA}%`)))
    .returning({ id: schema.software.id });
  contar("software", sw.length);

  const aulas = await db
    .delete(schema.virtualRoom)
    .where(scoped(schema.virtualRoom.organizationId, org!.id, like(schema.virtualRoom.name, `${MARCA}%`)))
    .returning({ id: schema.virtualRoom.id });
  contar("aulas virtuales", aulas.length);

  console.log("\n  Borrado:");
  for (const [k, v] of Object.entries(borrado)) {
    if (v > 0) console.log(`    ${String(v).padStart(4)}  ${k}`);
  }

  /* -- La verificación: sin esto, "borrado" es una promesa -- */
  const restos = await verificarLimpio();
  if (restos.length > 0) {
    console.error("\n  QUEDARON RASTROS:");
    for (const r of restos) console.error(`    ${r}`);
    return false;
  }
  console.log("\n  Verificado: no queda ningún rastro del demo.\n");
  return true;
}

/** Busca cualquier fila marcada que haya sobrevivido. Vacío = limpio. */
async function verificarLimpio(): Promise<string[]> {
  const db = getDb();
  const restos: string[] = [];
  const mirar = async (etiqueta: string, filas: { id: string }[]) => {
    if (filas.length > 0) restos.push(`${etiqueta}: ${filas.length}`);
  };

  await mirar(
    "camadas",
    await db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(scoped(schema.cohort.organizationId, org!.id, like(schema.cohort.name, `${MARCA}%`)))
  );
  await mirar(
    "cursos",
    await db
      .select({ id: schema.course.id })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, org!.id, like(schema.course.name, `${MARCA}%`)))
  );
  await mirar(
    "contactos",
    await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, org!.id, like(schema.contact.firstName, `${MARCA}%`)))
  );
  await mirar(
    "profesores",
    await db
      .select({ id: schema.teacher.id })
      .from(schema.teacher)
      .where(scoped(schema.teacher.organizationId, org!.id, like(schema.teacher.name, `${MARCA}%`)))
  );
  await mirar(
    "software",
    await db
      .select({ id: schema.software.id })
      .from(schema.software)
      .where(scoped(schema.software.organizationId, org!.id, like(schema.software.name, `${MARCA}%`)))
  );
  await mirar(
    "aulas virtuales",
    await db
      .select({ id: schema.virtualRoom.id })
      .from(schema.virtualRoom)
      .where(scoped(schema.virtualRoom.organizationId, org!.id, like(schema.virtualRoom.name, `${MARCA}%`)))
  );
  await mirar(
    "material",
    await db
      .select({ id: schema.resource.id })
      .from(schema.resource)
      .where(scoped(schema.resource.organizationId, org!.id, like(schema.resource.title, `${MARCA}%`)))
  );
  await mirar(
    "cuentas de usuario",
    await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.email, [CORREO_ALUMNO, CORREO_PROFESOR]))
  );

  return restos;
}

/* ============================================================ */

console.log(`\n  organización: ${org.name}`);

const ok = await withOrganizationScope(org.id, `cli:demo-camada:${accion}`, async () => {
  if (accion === "crear") return crear();
  if (accion === "borrar") return borrar();
  await estado();
  return true;
});

await getSql().end();
process.exit(ok ? 0 : 1);
