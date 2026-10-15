import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { etiquetaDeModulo, modulosConOrdinal } from "@/lib/program-order";
import {
  decidirSalidaDeModulo,
  planDeInscripcionAModulos,
  resumenDelFaltante,
  type HechosDeInscripcionAModulos,
  type InscripcionExcluida,
  type PlanDeInscripcionAModulos,
} from "@/lib/module-auto-enroll";

/**
 * 034 (US1, FR-001..FR-005a) — Las inscripciones a módulos que se crean solas.
 *
 * La regla (qué crear, qué ya estaba, a quién se excluye) es PURA y vive en
 * `src/lib/module-auto-enroll.ts`. Acá se averiguan los hechos y se escribe.
 * Hay tres puertas, y las tres llaman a `inscribirEnModulos`:
 *
 * - `createCohort` (`courses.ts`) — al crear un módulo, por los dos caminos de
 *   032 ("Curso existente" y "Módulo nuevo"), en la MISMA transacción.
 * - `createEnrollment` (`enrollments.ts`) — al inscribir en la especialización.
 * - La regularización (FR-005), `POST /api/cohorts/[id]/modules/enrollments`,
 *   que la ejecuta la coordinación con vista previa. **Nunca corre sola**: ni
 *   al desplegar ni en una migración (EBIM 14 se arregla con un clic del
 *   dueño, decidido, no por efecto colateral de un deploy).
 *
 * ============================================================
 * Por qué las hijas se insertan acá y no con `createEnrollment`
 * ============================================================
 * `createEnrollment` hace, por alumno, cinco lecturas que acá ya se hicieron
 * en lote (cohorte, guarda del árbol, vendedor, contacto, etapa). Para 16
 * alumnos × 4 módulos serían ~300 consultas en una transacción. Las
 * condiciones que `verificarVinculoDeInscripcion` exige se cumplen por
 * CONSTRUCCIÓN: la cohorte sale de los módulos de la especialización (tiene
 * padre) y la madre sale de las inscripciones sin madre de esa misma
 * especialización (no es hija). Lo que una hija automática nunca lleva —monto,
 * cuotas, vendedor— simplemente no se escribe (FR-003).
 */

type Db = ReturnType<typeof getDb>;

export type FiltroDeInscripcion = {
  /** Sólo estas madres (FR-002: la persona recién inscripta). */
  madreIds?: readonly string[];
  /** Sólo estos módulos (FR-001: el módulo recién creado). */
  moduloIds?: readonly string[];
};

type Contexto = {
  hechos: HechosDeInscripcionAModulos;
  /** Lo que la madre aporta a su hija: etapa, fecha de inscripción y cédula. */
  madrePorId: Map<string, { stageId: string; enrolledAt: Date | null; nationalId: string | null }>;
};

async function leerHechos(
  db: Db,
  organizationId: string,
  especializacionId: string,
  filtro: FiltroDeInscripcion
): Promise<Contexto> {
  const vacio: Contexto = {
    hechos: { madres: [], modulos: [], hijas: [], inscripcionesEnModulos: [], exclusiones: [] },
    madrePorId: new Map(),
  };

  const filasDeModulos = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      courseId: schema.cohort.courseId,
      courseName: schema.course.name,
      position: schema.cohort.position,
      startDate: schema.cohort.startDate,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, especializacionId)
      )
    );
  // El rótulo sale del orden del PROGRAMA entero, aunque se filtre un módulo:
  // "Módulo 3" tiene que decir lo mismo que la grilla.
  const modulos = modulosConOrdinal(filasDeModulos)
    .filter((m) => !filtro.moduloIds || filtro.moduloIds.includes(m.id))
    .map((m) => ({
      cohortId: m.id,
      courseId: m.courseId,
      label: etiquetaDeModulo(m.ordinal, m.name ?? m.courseName),
    }));
  if (modulos.length === 0) return vacio;

  const filasDeMadres = await db
    .select({
      id: schema.enrollment.id,
      stageId: schema.enrollment.stageId,
      enrolledAt: schema.enrollment.enrolledAt,
      nationalId: schema.enrollment.nationalId,
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      archivedAt: schema.contact.archivedAt,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, especializacionId),
        isNull(schema.enrollment.parentEnrollmentId),
        filtro.madreIds ? inArray(schema.enrollment.id, [...filtro.madreIds]) : undefined
      )
    )
    .orderBy(asc(schema.contact.firstName));
  if (filasDeMadres.length === 0) return { ...vacio, hechos: { ...vacio.hechos, modulos } };

  const madreIds = filasDeMadres.map((m) => m.id);
  const contactIds = [...new Set(filasDeMadres.map((m) => m.contactId))];
  const moduloIds = modulos.map((m) => m.cohortId);

  const [hijas, enModulos, exclusiones] = await Promise.all([
    db
      .select({
        id: schema.enrollment.id,
        parentEnrollmentId: schema.enrollment.parentEnrollmentId,
        cohortId: schema.enrollment.cohortId,
        courseId: schema.cohort.courseId,
      })
      .from(schema.enrollment)
      .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          inArray(schema.enrollment.parentEnrollmentId, madreIds)
        )
      ),
    db
      .select({ contactId: schema.enrollment.contactId, cohortId: schema.enrollment.cohortId })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          inArray(schema.enrollment.contactId, contactIds),
          inArray(schema.enrollment.cohortId, moduloIds)
        )
      ),
    db
      .select({
        parentEnrollmentId: schema.moduleExclusion.parentEnrollmentId,
        cohortId: schema.moduleExclusion.moduleCohortId,
      })
      .from(schema.moduleExclusion)
      .where(
        scoped(
          schema.moduleExclusion.organizationId,
          organizationId,
          inArray(schema.moduleExclusion.parentEnrollmentId, madreIds)
        )
      ),
  ]);

  return {
    hechos: {
      madres: filasDeMadres.map((m) => ({
        enrollmentId: m.id,
        contactId: m.contactId,
        contactName: fullName(m),
        enBaja: m.archivedAt !== null,
      })),
      modulos,
      hijas,
      inscripcionesEnModulos: enModulos.filter(
        (i): i is { contactId: string; cohortId: string } => i.cohortId !== null
      ),
      exclusiones,
    },
    madrePorId: new Map(
      filasDeMadres.map((m) => [
        m.id,
        { stageId: m.stageId, enrolledAt: m.enrolledAt, nationalId: m.nationalId },
      ])
    ),
  };
}

/**
 * Crea las hijas que faltan y devuelve el plan ejecutado.
 *
 * Corre dentro de la transacción de quien llama (`withAuth`): si algo falla
 * LANZA y se revierte todo — el módulo recién creado incluido—. Nunca queda
 * un módulo con la mitad de los alumnos.
 *
 * `enrolledAt` de la hija es el de la MADRE, no "ahora": la persona está en el
 * programa desde que se inscribió. Con "ahora", regularizar un módulo que ya
 * empezó dejaría fuera del porcentaje de asistencia todas las clases
 * anteriores (`attendancePercentage` descarta lo previo a la inscripción), y
 * la asistencia que se cargue después para esas clases no contaría.
 */
export async function inscribirEnModulos(
  organizationId: string,
  especializacionId: string,
  filtro: FiltroDeInscripcion = {}
): Promise<PlanDeInscripcionAModulos> {
  const db = getDb();
  const { hechos, madrePorId } = await leerHechos(db, organizationId, especializacionId, filtro);
  const plan = planDeInscripcionAModulos(hechos);
  if (plan.aCrear.length === 0) return plan;

  const ahora = new Date();
  await db.insert(schema.enrollment).values(
    plan.aCrear.map((c) => {
      const madre = madrePorId.get(c.parentEnrollmentId);
      if (!madre) throw new Error("034 — la madre del plan no está entre las leídas");
      return {
        id: newId("enrollment"),
        organizationId,
        contactId: c.contactId,
        cohortId: c.cohortId,
        parentEnrollmentId: c.parentEnrollmentId,
        stageId: madre.stageId,
        enrolledAt: madre.enrolledAt ?? ahora,
        nationalId: madre.nationalId,
        // FR-003 — sin monto, sin cuotas, sin vendedor: la venta es la madre.
        amount: null,
        installments: null,
        sellerId: null,
      };
    })
  );
  return plan;
}

/* ============================================================
 * FR-005 / FR-005a — Vista previa, aviso y regularización
 * ============================================================ */

export type VistaPreviaDeInscripcionDto = {
  resumen: { inscripciones: number; alumnos: number; modulos: number };
  existentes: number;
  /** Por persona: qué módulos se le van a crear. */
  aCrear: { parentEnrollmentId: string; contactName: string; modules: string[] }[];
  excluidas: Pick<
    InscripcionExcluida,
    "parentEnrollmentId" | "contactName" | "moduleLabel" | "motivo" | "detalle"
  >[];
};

function armarVistaPrevia(
  hechos: HechosDeInscripcionAModulos,
  plan: PlanDeInscripcionAModulos
): VistaPreviaDeInscripcionDto {
  const nombre = new Map(hechos.madres.map((m) => [m.enrollmentId, m.contactName]));
  const rotulo = new Map(hechos.modulos.map((m) => [m.cohortId, m.label]));
  const porMadre = new Map<string, string[]>();
  for (const c of plan.aCrear) {
    porMadre.set(c.parentEnrollmentId, [
      ...(porMadre.get(c.parentEnrollmentId) ?? []),
      rotulo.get(c.cohortId) ?? c.cohortId,
    ]);
  }
  return {
    resumen: resumenDelFaltante(plan),
    existentes: plan.existentes.length,
    aCrear: [...porMadre].map(([parentEnrollmentId, modules]) => ({
      parentEnrollmentId,
      contactName: nombre.get(parentEnrollmentId) ?? "",
      modules,
    })),
    excluidas: plan.excluidas.map((e) => ({
      parentEnrollmentId: e.parentEnrollmentId,
      contactName: e.contactName,
      moduleLabel: e.moduleLabel,
      motivo: e.motivo,
      detalle: e.detalle,
    })),
  };
}

/** Lo que HARÍA la regularización, sin escribir nada. `null` = no es una especialización. */
export async function vistaPreviaDeInscripcion(
  organizationId: string,
  especializacionId: string
): Promise<VistaPreviaDeInscripcionDto | null> {
  const db = getDb();
  if (!(await esEspecializacion(db, organizationId, especializacionId))) return null;
  const { hechos } = await leerHechos(db, organizationId, especializacionId, {});
  return armarVistaPrevia(hechos, planDeInscripcionAModulos(hechos));
}

/**
 * FR-005 — "Inscribir a todos los alumnos en sus módulos". Idempotente: el
 * plan sólo crea lo que falta, así que la segunda vez no crea nada. Devuelve
 * lo que efectivamente hizo, dicho con la misma forma que la vista previa.
 */
export async function regularizarInscripciones(
  organizationId: string,
  especializacionId: string
): Promise<VistaPreviaDeInscripcionDto | null> {
  const db = getDb();
  if (!(await esEspecializacion(db, organizationId, especializacionId))) return null;
  const { hechos } = await leerHechos(db, organizationId, especializacionId, {});
  const plan = await inscribirEnModulos(organizationId, especializacionId);
  return armarVistaPrevia(hechos, plan);
}

async function esEspecializacion(
  db: Db,
  organizationId: string,
  cohortId: string
): Promise<boolean> {
  const [fila] = await db
    .select({ isSpecialization: schema.cohort.isSpecialization })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return fila?.isSpecialization === true;
}

/* ============================================================
 * FR-004 — Sacar a una persona de UN módulo
 * ============================================================ */

export type SalidaDeModuloResult =
  | { ok: true; licenciasLiberadas: number }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

async function contarPor(
  db: Db,
  organizationId: string,
  tabla:
    | typeof schema.attendance
    | typeof schema.assessmentResult
    | typeof schema.submission
    | typeof schema.certificate
    | typeof schema.installment
    | typeof schema.license,
  enrollmentId: string
): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tabla)
    .where(scoped(tabla.organizationId, organizationId, eq(tabla.enrollmentId, enrollmentId)));
  return fila?.n ?? 0;
}

/**
 * Saca a la persona de este módulo: borra la inscripción HIJA (si no tiene
 * historia, `decidirSalidaDeModulo`) y deja registrado que no lo cursa, para
 * que la regularización no la vuelva a meter. La madre y las otras hijas no se
 * tocan. Sus licencias del módulo se liberan (cascada) y vuelven al stock.
 */
export async function sacarDeModulo(
  organizationId: string,
  enrollmentId: string,
  actorUserId: string | null
): Promise<SalidaDeModuloResult> {
  const db = getDb();
  const [hija] = await db
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
    })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
    )
    .limit(1);
  if (!hija) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const [asistencias, resultados, entregas, certificados, cuotas, licencias] = await Promise.all([
    contarPor(db, organizationId, schema.attendance, enrollmentId),
    contarPor(db, organizationId, schema.assessmentResult, enrollmentId),
    contarPor(db, organizationId, schema.submission, enrollmentId),
    contarPor(db, organizationId, schema.certificate, enrollmentId),
    contarPor(db, organizationId, schema.installment, enrollmentId),
    contarPor(db, organizationId, schema.license, enrollmentId),
  ]);

  const decision = decidirSalidaDeModulo({
    esHija: hija.parentEnrollmentId !== null && hija.cohortId !== null,
    asistencias,
    resultados,
    entregas,
    certificados,
    cuotas,
    licencias,
  });
  if (!decision.ok) {
    return {
      ok: false,
      status: decision.code === "modulo_con_historia" ? 409 : 422,
      code: decision.code,
      message: decision.message,
    };
  }

  await db
    .delete(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(eq(schema.enrollment.id, enrollmentId), eq(schema.enrollment.parentEnrollmentId, hija.parentEnrollmentId!))
      )
    );
  await db
    .insert(schema.moduleExclusion)
    .values({
      id: newId("moduleExclusion"),
      organizationId,
      parentEnrollmentId: hija.parentEnrollmentId!,
      moduleCohortId: hija.cohortId!,
      createdBy: actorUserId,
    })
    .onConflictDoNothing();

  return { ok: true, licenciasLiberadas: decision.licenciasLiberadas };
}

/**
 * Quien vuelve a un módulo por el alta manual de 028 deja de estar excluido:
 * la decisión nueva pisa a la vieja. Lo llama `createEnrollment` con madre.
 */
export async function olvidarExclusion(
  organizationId: string,
  parentEnrollmentId: string,
  moduleCohortId: string
): Promise<void> {
  const db = getDb();
  const donde = scoped(
    schema.moduleExclusion.organizationId,
    organizationId,
    eq(schema.moduleExclusion.parentEnrollmentId, parentEnrollmentId),
    eq(schema.moduleExclusion.moduleCohortId, moduleCohortId)
  );
  // Se mira antes de borrar: el caso normal (nadie la sacó) no escribe nada.
  const [hay] = await db
    .select({ id: schema.moduleExclusion.id })
    .from(schema.moduleExclusion)
    .where(donde)
    .limit(1);
  if (hay) await db.delete(schema.moduleExclusion).where(donde);
}
