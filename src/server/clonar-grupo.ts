import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { diaCalendario, diaComoFecha } from "@/lib/access-expiry";
import {
  etiquetaDeClaseDeOrigen,
  planDeFechasDeGrupo,
  validarFechasDelClon,
  type FechasDeGrupo,
  type VistaPreviaDelClonDto,
} from "@/lib/clonar-grupo";
import { createCohort, type CohortInput, type CreateCohortResult } from "@/server/courses";
import { copyAssessments, listAssessments } from "@/server/grading";
import { zonaDeLaOrganizacion } from "@/server/access-expiry";

/**
 * "Basar en un grupo existente" (alta de grupo): un grupo NUEVO con los datos
 * del FORMULARIO —que vienen precargados del grupo de origen y la persona
 * pudo cambiar— más lo que el formulario no tiene:
 *
 * - el material propio del grupo de origen;
 * - el material de sus CLASES, como material del grupo que recuerda de qué
 *   clase venía (`origin_class_*`): el grupo nuevo todavía no tiene clases, y
 *   se asigna a mano desde la pestaña Clases (`asignarMaterialAClase`);
 * - sus evaluaciones, por `copyAssessments` —el ÚNICO camino de copia, que
 *   lleva consigna, adjuntos y rúbrica— con los plazos corridos;
 * - en una especialización, cada módulo con su configuración, material y
 *   evaluaciones, colgado de la especialización nueva en el mismo orden y con
 *   las fechas que la persona eligió para cada uno.
 *
 * **No se copia** nada de las personas ni de lo que pasó: inscripciones,
 * asistencia, clases, grabaciones, enlaces de reunión y de WhatsApp,
 * entregas, notas, correcciones, prórrogas, certificados, avisos, licencias
 * asignadas, la confirmación ni los avisos internos. El grupo nace sin
 * cronograma, como cualquier alta: se genera al confirmarlo o con "Generar
 * cronograma", que respeta los recesos.
 *
 * Todo corre en la transacción del pedido: lo que se valida, se valida ANTES
 * de escribir (y devuelve un 422); lo que falla después LANZA, para que no
 * quede medio grupo creado.
 */

type FilaDeGrupo = {
  id: string;
  courseId: string;
  courseName: string;
  name: string | null;
  parentCohortId: string | null;
  position: number | null;
  isSpecialization: boolean;
  registrationStatus: string | null;
  startDate: Date;
  endDate: Date | null;
  deliveryDeadline: Date | null;
  teacherId: string | null;
  cost: number | null;
  currency: (typeof schema.cohort.$inferSelect)["currency"];
  minAttendancePct: number | null;
  frequency: string | null;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
  classroom: string | null;
  capacity: number | null;
  virtualRoomId: string | null;
  virtualRoomArchivedAt: Date | null;
};

const columnasDeGrupo = {
  id: schema.cohort.id,
  courseId: schema.cohort.courseId,
  courseName: schema.course.name,
  name: schema.cohort.name,
  parentCohortId: schema.cohort.parentCohortId,
  position: schema.cohort.position,
  isSpecialization: schema.cohort.isSpecialization,
  registrationStatus: schema.cohort.registrationStatus,
  startDate: schema.cohort.startDate,
  endDate: schema.cohort.endDate,
  deliveryDeadline: schema.cohort.deliveryDeadline,
  teacherId: schema.cohort.teacherId,
  cost: schema.cohort.cost,
  currency: schema.cohort.currency,
  minAttendancePct: schema.cohort.minAttendancePct,
  frequency: schema.cohort.frequency,
  startTime: schema.cohort.startTime,
  endTime: schema.cohort.endTime,
  daysOfWeek: schema.cohort.daysOfWeek,
  classroom: schema.cohort.classroom,
  capacity: schema.cohort.capacity,
  virtualRoomId: schema.cohort.virtualRoomId,
  virtualRoomArchivedAt: schema.virtualRoom.archivedAt,
};

function nombreVisible(g: FilaDeGrupo): string {
  return g.name?.trim() || g.courseName;
}

function fechasDe(g: FilaDeGrupo): FechasDeGrupo {
  return { startDate: diaCalendario(g.startDate), endDate: g.endDate ? diaCalendario(g.endDate) : null };
}

async function leerGrupo(organizationId: string, cohortId: string): Promise<FilaDeGrupo | null> {
  const [row] = await getDb()
    .select(columnasDeGrupo)
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.virtualRoom, eq(schema.cohort.virtualRoomId, schema.virtualRoom.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return (row as FilaDeGrupo | undefined) ?? null;
}

async function leerModulos(organizationId: string, cohortId: string): Promise<FilaDeGrupo[]> {
  const rows = await getDb()
    .select(columnasDeGrupo)
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.virtualRoom, eq(schema.cohort.virtualRoomId, schema.virtualRoom.id))
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.parentCohortId, cohortId))
    )
    .orderBy(asc(schema.cohort.position), asc(schema.cohort.startDate));
  return rows as FilaDeGrupo[];
}

async function contarMaterial(organizationId: string, cohortId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.resource.cohortId, cohortId)));
  return Number(row?.n ?? 0);
}

async function contarMaterialDeClases(organizationId: string, cohortId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.resource)
    .innerJoin(schema.classSession, eq(schema.resource.classSessionId, schema.classSession.id))
    .where(
      scoped(schema.resource.organizationId, organizationId, eq(schema.classSession.cohortId, cohortId))
    );
  return Number(row?.n ?? 0);
}

async function softwareDe(organizationId: string, cohortId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ softwareId: schema.cohortSoftware.softwareId })
    .from(schema.cohortSoftware)
    .where(
      scoped(schema.cohortSoftware.organizationId, organizationId, eq(schema.cohortSoftware.cohortId, cohortId))
    );
  return rows.map((r) => r.softwareId);
}

export type ClonError = { ok: false; status: 404 | 422; code: string; message: string };

const NO_ENCONTRADO: ClonError = {
  ok: false,
  status: 404,
  code: "origen_not_found",
  message: "El grupo en el que se basa no existe",
};

function invalido(code: string, message: string): ClonError {
  return { ok: false, status: 422, code, message };
}

/** En qué grupos se puede basar uno nuevo: un grupo suelto o una especialización entera. */
function puedeClonarse(g: FilaDeGrupo): ClonError | null {
  if (g.parentCohortId) {
    return invalido(
      "clonar_modulo",
      "Un módulo se copia junto con su especialización: basate en la especialización."
    );
  }
  if (g.registrationStatus !== null) {
    return invalido("clonar_taller", "Las ediciones de taller se crean desde Talleres.");
  }
  return null;
}

/** Lo que el formulario muestra de lo que se va a copiar, y los módulos para sugerir fechas. */
export async function previsualizarClon(
  organizationId: string,
  cohortId: string
): Promise<{ ok: true; data: VistaPreviaDelClonDto } | ClonError> {
  const grupo = await leerGrupo(organizationId, cohortId);
  if (!grupo) return NO_ENCONTRADO;
  const error = puedeClonarse(grupo);
  if (error) return error;

  const modulos = await leerModulos(organizationId, cohortId);
  const contar = async (id: string) => ({
    material: await contarMaterial(organizationId, id),
    deClases: await contarMaterialDeClases(organizationId, id),
    evaluaciones: (await listAssessments(organizationId, id)).length,
  });
  const propio = await contar(cohortId);
  const software = await softwareDe(organizationId, cohortId);
  const porModulo: Awaited<ReturnType<typeof contar>>[] = [];
  for (const m of modulos) porModulo.push(await contar(m.id));

  return {
    ok: true,
    data: {
      source: {
        id: grupo.id,
        name: nombreVisible(grupo),
        courseName: grupo.courseName,
        ...fechasDe(grupo),
        deliveryDeadline: grupo.deliveryDeadline ? diaCalendario(grupo.deliveryDeadline) : null,
        isSpecialization: grupo.isSpecialization,
      },
      materialCount: propio.material,
      classMaterialCount: propio.deClases,
      assessmentCount: propio.evaluaciones,
      softwareCount: software.length,
      roomArchived: grupo.virtualRoomArchivedAt !== null,
      modules: modulos.map((m, i) => ({
        id: m.id,
        name: nombreVisible(m),
        position: m.position,
        ...fechasDe(m),
        materialCount: porModulo[i]?.material ?? 0,
        classMaterialCount: porModulo[i]?.deClases ?? 0,
        assessmentCount: porModulo[i]?.evaluaciones ?? 0,
      })),
    },
  };
}

export type ModuloPedido = {
  sourceCohortId: string;
  name?: string | null;
  startDate: string;
  endDate: string | null;
};

export type BaseDelAlta = { cohortId: string; modules: ModuloPedido[] };

/**
 * Copia el material del grupo de origen: el propio, tal cual, y el de sus
 * clases como material del grupo con la clase de origen recordada.
 */
async function copiarMaterial(organizationId: string, desde: string, hacia: string): Promise<void> {
  const db = getDb();
  const propio = await db
    .select({
      title: schema.resource.title,
      url: schema.resource.url,
      kind: schema.resource.kind,
      position: schema.resource.position,
      courseModuleId: schema.resource.courseModuleId,
    })
    .from(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.resource.cohortId, desde)))
    .orderBy(asc(schema.resource.position), asc(schema.resource.createdAt));

  const deClases = await db
    .select({
      title: schema.resource.title,
      url: schema.resource.url,
      kind: schema.resource.kind,
      courseModuleId: schema.resource.courseModuleId,
      classNumber: schema.classSession.number,
      classDate: schema.classSession.date,
      classTopic: schema.classSession.topic,
    })
    .from(schema.resource)
    .innerJoin(schema.classSession, eq(schema.resource.classSessionId, schema.classSession.id))
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.classSession.cohortId, desde)))
    .orderBy(
      asc(schema.classSession.number),
      asc(schema.resource.position),
      asc(schema.resource.createdAt)
    );

  const siguiente = propio.reduce((max, r) => Math.max(max, r.position + 1), 0);
  const filas = [
    ...propio.map((r) => ({
      id: newId("resource"),
      organizationId,
      cohortId: hacia,
      courseModuleId: r.courseModuleId,
      title: r.title,
      url: r.url,
      kind: r.kind,
      position: r.position,
    })),
    ...deClases.map((r, i) => ({
      id: newId("resource"),
      organizationId,
      cohortId: hacia,
      courseModuleId: r.courseModuleId,
      title: r.title,
      url: r.url,
      kind: r.kind,
      position: siguiente + i,
      originClassNumber: r.classNumber,
      originClassLabel: etiquetaDeClaseDeOrigen({
        number: r.classNumber,
        date: diaCalendario(r.classDate),
        topic: r.classTopic,
      }),
    })),
  ];
  if (filas.length === 0) return;
  await db.insert(schema.resource).values(filas);
}

/**
 * Lo que el grupo nuevo lleva del de origen además de su configuración:
 * material y evaluaciones (con plazos corridos). Ya existe el grupo: si algo
 * falla acá, LANZA.
 */
async function copiarContenido(
  organizationId: string,
  origen: FilaDeGrupo,
  nuevoId: string,
  plazos: ReadonlyMap<string, string | null>,
  etiqueta?: string
): Promise<string[]> {
  await copiarMaterial(organizationId, origen.id, nuevoId);
  const copia = await copyAssessments(organizationId, origen.id, nuevoId, { plazos });
  if (!copia.ok) {
    throw new Error(`Basar en un grupo — no se pudieron copiar las evaluaciones: ${copia.message}`);
  }
  return copia.data.omitidas.length > 0
    ? [
        `Evaluaciones con nombre repetido${etiqueta ? ` en ${etiqueta}` : ""} se copiaron una vez: ${copia.data.omitidas.join(", ")}.`,
      ]
    : [];
}

async function planDe(
  organizationId: string,
  origen: FilaDeGrupo,
  destino: FechasDeGrupo & { deliveryDeadline?: string | null },
  timeZone: string,
  etiqueta?: string
) {
  const evaluaciones = await listAssessments(organizationId, origen.id);
  return planDeFechasDeGrupo(
    {
      startDate: diaCalendario(origen.startDate),
      deliveryDeadline: origen.deliveryDeadline ? diaCalendario(origen.deliveryDeadline) : null,
      assessments: evaluaciones.map((a) => ({ id: a.id, name: a.name, dueAt: a.dueAt ?? null })),
    },
    destino,
    timeZone,
    etiqueta
  );
}

/** Un módulo del grupo de origen, con su configuración y las fechas elegidas. */
async function crearModulo(
  organizationId: string,
  origen: FilaDeGrupo,
  pedido: ModuloPedido,
  madreId: string,
  timeZone: string
): Promise<{ id: string; avisos: string[] }> {
  const etiqueta = nombreVisible(origen);
  const fechas = await planDe(
    organizationId,
    origen,
    { startDate: pedido.startDate, endDate: pedido.endDate },
    timeZone,
    etiqueta
  );
  const avisos = [...fechas.avisos];
  const aulaDeBaja = origen.virtualRoomArchivedAt !== null;
  if (aulaDeBaja) avisos.push(`El aula de ${etiqueta} está dada de baja: el módulo quedó sin aula.`);

  const creado = await createCohort(organizationId, {
    courseId: origen.courseId,
    // Sin nombre propio, el módulo sigue mostrando el de su curso.
    name: pedido.name?.trim() || origen.name,
    startDate: diaComoFecha(pedido.startDate),
    endDate: pedido.endDate ? diaComoFecha(pedido.endDate) : null,
    deliveryDeadline: fechas.deliveryDeadline ? diaComoFecha(fechas.deliveryDeadline) : null,
    teacherId: origen.teacherId,
    cost: origen.cost,
    currency: origen.currency,
    minAttendancePct: origen.minAttendancePct,
    frequency: origen.frequency,
    startTime: origen.startTime,
    endTime: origen.endTime,
    daysOfWeek: origen.daysOfWeek,
    classroom: origen.classroom,
    capacity: origen.capacity,
    virtualRoomId: aulaDeBaja ? null : origen.virtualRoomId,
    parentCohortId: madreId,
    position: origen.position,
    isSpecialization: false,
    softwareIds: await softwareDe(organizationId, origen.id),
  });
  if (!creado.ok) {
    throw new Error(`Basar en un grupo — no se pudo crear el módulo ${etiqueta}: ${creado.message}`);
  }
  avisos.push(...(await copiarContenido(organizationId, origen, creado.id, fechas.plazos, etiqueta)));
  return { id: creado.id, avisos };
}

export type AltaBasadaResult =
  | (Extract<CreateCohortResult, { ok: true }> & { moduleIds: string[]; avisos: string[] })
  | Extract<CreateCohortResult, { ok: false }>
  | ClonError;

/**
 * El alta de un grupo basado en otro. El grupo se crea con `input` (lo que
 * dice el formulario) por `createCohort`, igual que un alta común; después
 * se copia lo del origen.
 */
export async function crearGrupoBasadoEn(
  organizationId: string,
  input: CohortInput,
  base: BaseDelAlta
): Promise<AltaBasadaResult> {
  if (input.parentCohortId) {
    return invalido("clonar_modulo", "Un módulo nuevo no se basa en otro grupo.");
  }
  const grupo = await leerGrupo(organizationId, base.cohortId);
  if (!grupo) return NO_ENCONTRADO;
  const error = puedeClonarse(grupo);
  if (error) return error;

  const modulos = await leerModulos(organizationId, base.cohortId);
  if (modulos.length > 0 && !input.isSpecialization) {
    return invalido(
      "clonar_necesita_especializacion",
      "Para copiar sus módulos, el grupo nuevo tiene que ser una especialización."
    );
  }
  const inicio = diaCalendario(input.startDate);
  const fin = input.endDate ? diaCalendario(input.endDate) : null;
  const validas = validarFechasDelClon(
    { startDate: inicio, endDate: fin, modules: base.modules },
    modulos.map((m) => ({ id: m.id, name: nombreVisible(m) }))
  );
  if (!validas.ok) return invalido("fechas_invalidas", validas.message);

  const timeZone = await zonaDeLaOrganizacion(organizationId);
  const fechas = await planDe(
    organizationId,
    grupo,
    {
      startDate: inicio,
      endDate: fin,
      deliveryDeadline: input.deliveryDeadline ? diaCalendario(input.deliveryDeadline) : null,
    },
    timeZone
  );

  // Primera escritura. `createCohort` valida todo antes de insertar (un 422
  // acá no dejó nada); de acá en adelante, un fallo LANZA.
  const creado = await createCohort(organizationId, input);
  if (!creado.ok) return creado;

  const avisos = [...validas.avisos, ...fechas.avisos];
  avisos.push(...(await copiarContenido(organizationId, grupo, creado.id, fechas.plazos)));

  const pedidos = new Map(base.modules.map((m) => [m.sourceCohortId, m]));
  const moduleIds: string[] = [];
  for (const m of modulos) {
    const modulo = await crearModulo(organizationId, m, pedidos.get(m.id)!, creado.id, timeZone);
    moduleIds.push(modulo.id);
    avisos.push(...modulo.avisos);
  }

  return { ...creado, moduleIds, avisos };
}
