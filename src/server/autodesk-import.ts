import { asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  claveDeOferta,
  leerArchivoDeAutodesk,
  sugerirPrograma,
  type ArchivoDeAutodesk,
} from "@/lib/autodesk-import/archivo";
import type { AccionSobreCaso, MapeoDeOfertas } from "@/lib/autodesk-import/body";
import {
  accionesSeguras,
  contarCasos,
  estadoDelCurso,
  IMPORTACIONES_POR_EQUIPO,
  planDeConciliacion,
  resumenDeAsientos,
  subjectDelCaso,
  tareasQueSeCierran,
  type AliasDeCorreo,
  type CasoDeConciliacion,
  type EntradaDeConciliacion,
  type FilaDeAutodesk,
  type PersonaDelDirectorio,
  type PlanDeConciliacion,
  type RefDePersona,
  type ResolucionGuardada,
  type ResumenDeAsientos,
  type TareaAbierta,
  type TipoDeCaso,
  type TitularDeLicencias,
} from "@/lib/autodesk-import/conciliacion";
import { normalizarCorreo } from "@/lib/contact-identity";
import { correoDeLicencia } from "@/lib/license-email";
import { licenciaDeProfesorOcupada, licenciaOcupada } from "@/lib/license-rules";
import { aliasNormalizado } from "@/lib/license-team";
import { fullName } from "@/lib/utils";
import {
  assignLicense,
  assignTeacherLicense,
  buscarEquipo,
  moverLicenciaDeEquipo,
  unassignLicense,
  unassignTeacherLicense,
} from "@/server/licenses";

/**
 * 0091 — Importar el Excel de usuarios de Autodesk de UN equipo y conciliarlo
 * con el campus.
 *
 * Tres tiempos, todos con la misma `planDeConciliacion`:
 *   1. VISTA PREVIA (`vistaPreviaDeImportacion`): lee el archivo, propone el
 *      equipo y el programa de cada oferta, y cuenta qué casos saldrían. No
 *      escribe nada.
 *   2. IMPORTAR (`importarArchivo`): guarda la foto (las últimas 6 por equipo),
 *      recuerda el mapeo de ofertas y cierra las tareas pendientes que el
 *      archivo ya muestra hechas. NO toca ninguna licencia del campus.
 *   3. TRABAJAR el reporte (`reporteDeConciliacion` + `aplicarAccion` /
 *      `aplicarLoSeguro`): cada acción pasa por las mismas funciones de siempre
 *      (`assignLicense`, `unassignLicense`, `moverLicenciaDeEquipo`…), así que
 *      el candado de stock y las reglas del grupo valen igual. El servidor
 *      vuelve a calcular el plan y busca el caso: nunca confía en el cliente.
 */

type Db = ReturnType<typeof getDb>;

const TOPE_DE_LISTA = 400;

export type ResultadoConFallo<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string; extra?: Record<string, unknown> };

const fallo = (
  status: 404 | 409 | 422,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): { ok: false; status: 404 | 409 | 422; code: string; message: string; extra?: Record<string, unknown> } => ({
  ok: false,
  status,
  code,
  message,
  extra,
});

/* ============================================================
 * Lecturas de apoyo
 * ============================================================ */

async function programasDeLaOrganizacion(org: string) {
  return getDb()
    .select({ id: schema.software.id, name: schema.software.name })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, org))
    .orderBy(asc(schema.software.name));
}

/** El mapeo recordado: llave de oferta → programa (o `null` = no se gestiona). */
async function mapeoGuardado(org: string): Promise<Map<string, string | null>> {
  const filas = await getDb()
    .select({ clave: schema.licenseOfferingMap.offeringKey, softwareId: schema.licenseOfferingMap.softwareId })
    .from(schema.licenseOfferingMap)
    .where(scoped(schema.licenseOfferingMap.organizationId, org));
  return new Map(filas.map((f) => [f.clave, f.softwareId] as const));
}

const nombreDe = (f: { firstName: string; lastName: string; email: string }) =>
  fullName({ firstName: f.firstName, lastName: f.lastName }).trim() || f.email;

/* ============================================================
 * La entrada del plan (todo lo que lee el campus)
 * ============================================================ */

/**
 * Junta lo que el planificador necesita saber del campus para esas filas de
 * Autodesk y ese equipo: quién es cada correo, qué licencias tienen hoy esas
 * personas (y las del equipo, aunque no estén en Autodesk), sus inscripciones
 * y los programas que sus grupos tienen asignados.
 */
async function cargarEntrada(
  org: string,
  teamId: string,
  autodesk: readonly FilaDeAutodesk[],
  opts: { conHistorial: boolean }
): Promise<EntradaDeConciliacion> {
  const db: Db = getDb();
  const ahora = new Date();
  const correos = [...new Set(autodesk.map((a) => a.email))];

  // A) A quién pertenece cada correo de Autodesk.
  const [porContacto, porLicencia, porProfesor, aliasFilas] = correos.length
    ? await Promise.all([
        db
          .select({ id: schema.contact.id })
          .from(schema.contact)
          .where(
            scoped(
              schema.contact.organizationId,
              org,
              or(
                inArray(sql`lower(${schema.contact.email})`, correos),
                inArray(sql`lower(${schema.contact.secondaryEmail})`, correos)
              )
            )
          ),
        db
          .select({ id: schema.enrollment.contactId })
          .from(schema.enrollment)
          .where(
            scoped(
              schema.enrollment.organizationId,
              org,
              inArray(sql`lower(${schema.enrollment.licenseEmail})`, correos)
            )
          ),
        db
          .select({ id: schema.teacher.id })
          .from(schema.teacher)
          .where(scoped(schema.teacher.organizationId, org, inArray(sql`lower(${schema.teacher.email})`, correos))),
        db
          .select({
            email: schema.licenseEmailAlias.email,
            contactId: schema.licenseEmailAlias.contactId,
            teacherId: schema.licenseEmailAlias.teacherId,
          })
          .from(schema.licenseEmailAlias)
          .where(scoped(schema.licenseEmailAlias.organizationId, org, inArray(schema.licenseEmailAlias.email, correos))),
      ])
    : [[], [], [], []];

  // B) Quién tiene hoy una licencia asignada en ESTE equipo (esté o no en Autodesk).
  const delEquipo = await db
    .select({ contactId: schema.enrollment.contactId, teacherId: schema.license.teacherId })
    .from(schema.license)
    .leftJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
    .where(scoped(schema.license.organizationId, org, eq(schema.license.teamId, teamId), eq(schema.license.assigned, true)));

  const alias: AliasDeCorreo[] = aliasFilas.flatMap((a): AliasDeCorreo[] => {
    const ref: RefDePersona | null = a.contactId
      ? { tipo: "alumno", contactId: a.contactId }
      : a.teacherId
        ? { tipo: "profesor", teacherId: a.teacherId }
        : null;
    return ref ? [{ email: a.email.toLowerCase(), ref }] : [];
  });

  const contactIds = new Set<string>([
    ...porContacto.map((c) => c.id),
    ...porLicencia.map((c) => c.id),
    ...delEquipo.flatMap((d) => (d.contactId ? [d.contactId] : [])),
    ...alias.flatMap((a) => (a.ref.tipo === "alumno" ? [a.ref.contactId] : [])),
  ]);
  const teacherIds = new Set<string>([
    ...porProfesor.map((t) => t.id),
    ...delEquipo.flatMap((d) => (d.teacherId ? [d.teacherId] : [])),
    ...alias.flatMap((a) => (a.ref.tipo === "profesor" ? [a.ref.teacherId] : [])),
  ]);

  // C) Las personas, sus inscripciones y sus licencias (de cualquier equipo).
  const madre = madreDeLaInscripcion();
  const [contactos, profesores, inscripciones] = await Promise.all([
    contactIds.size
      ? db
          .select({
            id: schema.contact.id,
            firstName: schema.contact.firstName,
            lastName: schema.contact.lastName,
            email: schema.contact.email,
            secondaryEmail: schema.contact.secondaryEmail,
            archivedAt: schema.contact.archivedAt,
          })
          .from(schema.contact)
          .where(scoped(schema.contact.organizationId, org, inArray(schema.contact.id, [...contactIds])))
      : [],
    teacherIds.size
      ? db
          .select({ id: schema.teacher.id, name: schema.teacher.name, email: schema.teacher.email })
          .from(schema.teacher)
          .where(scoped(schema.teacher.organizationId, org, inArray(schema.teacher.id, [...teacherIds])))
      : [],
    contactIds.size
      ? db
          .select({
            id: schema.enrollment.id,
            contactId: schema.enrollment.contactId,
            cohortId: schema.enrollment.cohortId,
            hadOwnLicense: schema.enrollment.hadOwnLicense,
            parentHadOwnLicense: madre.hadOwnLicense,
            licenseEmail: schema.enrollment.licenseEmail,
            parentLicenseEmail: madre.licenseEmail,
            cohortName: schema.cohort.name,
            courseName: schema.course.name,
            startDate: schema.cohort.startDate,
            endDate: schema.cohort.endDate,
          })
          .from(schema.enrollment)
          .leftJoin(madre, eq(schema.enrollment.parentEnrollmentId, madre.id))
          .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
          .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
          .where(scoped(schema.enrollment.organizationId, org, inArray(schema.enrollment.contactId, [...contactIds])))
      : [],
  ]);

  const enrollmentIds = inscripciones.map((i) => i.id);
  const cohortIds = [...new Set(inscripciones.flatMap((i) => (i.cohortId ? [i.cohortId] : [])))];
  const [licencias, delGrupo] = await Promise.all([
    enrollmentIds.length || teacherIds.size
      ? db
          .select({
            id: schema.license.id,
            enrollmentId: schema.license.enrollmentId,
            teacherId: schema.license.teacherId,
            softwareId: schema.license.softwareId,
            teamId: schema.license.teamId,
            source: schema.license.source,
            expiresAt: schema.license.expiresAt,
          })
          .from(schema.license)
          .where(
            scoped(
              schema.license.organizationId,
              org,
              eq(schema.license.assigned, true),
              or(
                enrollmentIds.length ? inArray(schema.license.enrollmentId, enrollmentIds) : undefined,
                teacherIds.size ? inArray(schema.license.teacherId, [...teacherIds]) : undefined
              )
            )
          )
      : [],
    cohortIds.length
      ? db
          .select({ cohortId: schema.cohortGroupSoftware.cohortId, softwareId: schema.cohortGroupSoftware.softwareId })
          .from(schema.cohortGroupSoftware)
          .where(scoped(schema.cohortGroupSoftware.organizationId, org, inArray(schema.cohortGroupSoftware.cohortId, cohortIds)))
      : [],
  ]);

  // --- Directorio ---------------------------------------------------------------
  const minus = (v: string | null | undefined) => normalizarCorreo(v);
  const directorio: PersonaDelDirectorio[] = [];
  for (const c of contactos) {
    const delContacto = inscripciones.filter((i) => i.contactId === c.id);
    directorio.push({
      ref: { tipo: "alumno", contactId: c.id },
      nombre: fullName({ firstName: c.firstName, lastName: c.lastName }),
      correos: [
        ...new Set(
          [c.email, ...delContacto.flatMap((i) => [i.licenseEmail, i.parentLicenseEmail])].flatMap((x) => {
            const m = minus(x);
            return m ? [m] : [];
          })
        ),
      ],
      secundarios: [minus(c.secondaryEmail)].flatMap((x) => (x ? [x] : [])),
      archivada: c.archivedAt !== null,
    });
  }
  for (const t of profesores) {
    directorio.push({
      ref: { tipo: "profesor", teacherId: t.id },
      nombre: t.name,
      correos: [minus(t.email)].flatMap((x) => (x ? [x] : [])),
      archivada: false,
    });
  }

  // --- Titulares ------------------------------------------------------------------
  const programasDelGrupoDe = new Map<string, string[]>();
  for (const g of delGrupo) {
    programasDelGrupoDe.set(g.cohortId, [...(programasDelGrupoDe.get(g.cohortId) ?? []), g.softwareId]);
  }
  const contactoPor = new Map(contactos.map((c) => [c.id, c] as const));
  const licenciaDe = (l: (typeof licencias)[number], ocupa: boolean) => ({
    licenseId: l.id,
    softwareId: l.softwareId,
    teamId: l.teamId,
    source: l.source,
    ocupa,
  });

  const titulares: TitularDeLicencias[] = [];
  for (const i of inscripciones) {
    const cohorte = i.cohortId ? { startDate: i.startDate, endDate: i.endDate } : null;
    const propias = licencias.filter((l) => l.enrollmentId === i.id);
    titulares.push({
      ref: { tipo: "alumno", contactId: i.contactId },
      enrollmentId: i.id,
      grupo: i.cohortName ?? i.courseName ?? null,
      conGrupo: Boolean(i.cohortId),
      curso: estadoDelCurso(cohorte, ahora),
      programasDelGrupo: i.cohortId ? (programasDelGrupoDe.get(i.cohortId) ?? []) : [],
      licenciaPropia: i.hadOwnLicense || Boolean(i.parentHadOwnLicense),
      correo:
        minus(
          correoDeLicencia({
            licenseEmail: i.licenseEmail,
            parentLicenseEmail: i.parentLicenseEmail,
            contactEmail: contactoPor.get(i.contactId)?.email ?? null,
          }).email
        ) ?? null,
      licencias: propias.map((l) =>
        licenciaDe(l, licenciaOcupada({ assigned: true, expiresAt: l.expiresAt }, cohorte, ahora))
      ),
    });
  }
  for (const t of profesores) {
    titulares.push({
      ref: { tipo: "profesor", teacherId: t.id },
      enrollmentId: null,
      grupo: null,
      curso: null,
      programasDelGrupo: [],
      licenciaPropia: false,
      correo: minus(t.email),
      licencias: licencias
        .filter((l) => l.teacherId === t.id)
        .map((l) => licenciaDe(l, licenciaDeProfesorOcupada({ assigned: true, expiresAt: l.expiresAt }, ahora))),
    });
  }

  // D) Lo que dicen los OTROS equipos (su última importación).
  const otrosEquipos = await filasDeOtrosEquipos(db, org, teamId, correos);

  // E) Decisiones y tareas.
  const [resolucionesFilas, tareasFilas] = await Promise.all([
    db
      .select()
      .from(schema.licenseCaseResolution)
      .where(scoped(schema.licenseCaseResolution.organizationId, org, eq(schema.licenseCaseResolution.teamId, teamId))),
    db
      .select()
      .from(schema.licenseAutodeskTask)
      .where(
        scoped(
          schema.licenseAutodeskTask.organizationId,
          org,
          eq(schema.licenseAutodeskTask.teamId, teamId),
          eq(schema.licenseAutodeskTask.status, "abierta")
        )
      ),
  ]);
  const resoluciones: ResolucionGuardada[] = resolucionesFilas.map((r) => ({
    teamId: r.teamId,
    softwareId: r.softwareId,
    subject: r.subject,
    decision: r.decision,
    nota: r.note,
    huella: r.fingerprint,
    resueltoPor: r.resolvedBy,
    resueltoEn: r.resolvedAt.toISOString(),
  }));
  const tareas: TareaAbierta[] = tareasFilas.map(tareaAbierta);

  // F) Desde cuándo aparece cada (correo, programa) en las importaciones guardadas.
  const apariciones = opts.conHistorial ? await historialDeApariciones(db, org, teamId) : undefined;

  return { teamId, autodesk, directorio, alias, titulares, otrosEquipos, resoluciones, tareas, apariciones };
}

function madreDeLaInscripcion() {
  return alias(schema.enrollment, "madre_de_licencia");
}

function tareaAbierta(t: typeof schema.licenseAutodeskTask.$inferSelect): TareaAbierta {
  return {
    id: t.id,
    teamId: t.teamId,
    softwareId: t.softwareId,
    kind: t.kind,
    email: t.email,
    ref: t.contactId
      ? { tipo: "alumno", contactId: t.contactId }
      : t.teacherId
        ? { tipo: "profesor", teacherId: t.teacherId }
        : null,
    persona: t.personName,
    creadaEn: t.createdAt.toISOString(),
  };
}

async function filasDeOtrosEquipos(db: Db, org: string, teamId: string, correos: readonly string[]) {
  if (correos.length === 0) return [];
  const lotes = await db
    .select({ id: schema.licenseImportBatch.id, teamId: schema.licenseImportBatch.teamId })
    .from(schema.licenseImportBatch)
    .where(scoped(schema.licenseImportBatch.organizationId, org, ne(schema.licenseImportBatch.teamId, teamId)))
    .orderBy(desc(schema.licenseImportBatch.uploadedAt), desc(schema.licenseImportBatch.id));
  const ultimo = new Map<string, string>();
  for (const l of lotes) if (!ultimo.has(l.teamId)) ultimo.set(l.teamId, l.id);
  if (ultimo.size === 0) return [];
  return db
    .select({
      email: schema.licenseImportRow.email,
      softwareId: schema.licenseImportRow.softwareId,
      teamId: schema.licenseImportRow.teamId,
    })
    .from(schema.licenseImportRow)
    .where(
      scoped(
        schema.licenseImportRow.organizationId,
        org,
        inArray(schema.licenseImportRow.batchId, [...ultimo.values()]),
        inArray(schema.licenseImportRow.email, [...correos])
      )
    );
}

async function historialDeApariciones(db: Db, org: string, teamId: string) {
  const lotes = await db
    .select({ id: schema.licenseImportBatch.id, uploadedAt: schema.licenseImportBatch.uploadedAt })
    .from(schema.licenseImportBatch)
    .where(scoped(schema.licenseImportBatch.organizationId, org, eq(schema.licenseImportBatch.teamId, teamId)))
    .orderBy(asc(schema.licenseImportBatch.uploadedAt));
  if (lotes.length === 0) return undefined;
  const filas = await db
    .select({
      batchId: schema.licenseImportRow.batchId,
      email: schema.licenseImportRow.email,
      softwareId: schema.licenseImportRow.softwareId,
    })
    .from(schema.licenseImportRow)
    .where(
      scoped(
        schema.licenseImportRow.organizationId,
        org,
        inArray(
          schema.licenseImportRow.batchId,
          lotes.map((l) => l.id)
        )
      )
    );
  const fechaDe = new Map(lotes.map((l) => [l.id, l.uploadedAt] as const));
  const salida = new Map<string, { n: number; de: number; desde: string }>();
  for (const f of filas) {
    const k = `${f.email}|${f.softwareId}`;
    const fecha = fechaDe.get(f.batchId)!.toISOString();
    const previa = salida.get(k);
    salida.set(k, {
      n: (previa?.n ?? 0) + 1,
      de: lotes.length,
      desde: previa && previa.desde < fecha ? previa.desde : fecha,
    });
  }
  return salida;
}

/* ============================================================
 * Vista previa
 * ============================================================ */

export type OfertaDeLaVistaPrevia = {
  clave: string;
  nombre: string;
  personas: number;
  /** El programa elegido (guardado, enviado o sugerido); `null` = sin elegir o ignorada. */
  softwareId: string | null;
  origen: "guardado" | "enviado" | "sugerido" | "sin_mapear";
  /** «El campus no gestiona esta oferta». */
  ignorada: boolean;
};

export type CasoDto = CasoDeConciliacion & { programa: string };

export type VistaPreviaDeImportacion = {
  archivo: {
    fileName: string;
    filas: number;
    personas: number;
    sinLicencia: number;
    filasSinCorreo: number;
    teamAlias: string | null;
  };
  ofertas: OfertaDeLaVistaPrevia[];
  /** El equipo cuyo alias de Autodesk coincide con el del archivo. */
  equipoPropuesto: string | null;
  /** El archivo dice otro equipo que el elegido. */
  avisoDeEquipo: string | null;
  /** El equipo elegido no tiene alias y el archivo trae uno: se puede guardar. */
  puedeGuardarAlias: boolean;
  /** Hay equipo elegido y todas las ofertas tienen programa o están ignoradas. */
  importable: boolean;
  conteo: Record<TipoDeCaso, number> | null;
  casos: CasoDto[];
  truncado: boolean;
  detalleOculto: boolean;
};

function ofertasConMapeo(
  archivo: ArchivoDeAutodesk,
  guardado: ReadonlyMap<string, string | null>,
  enviado: MapeoDeOfertas,
  programas: readonly { id: string; name: string }[]
): OfertaDeLaVistaPrevia[] {
  const ids = new Set(programas.map((p) => p.id));
  return archivo.ofertas.map((o) => {
    let softwareId: string | null = null;
    let origen: OfertaDeLaVistaPrevia["origen"] = "sin_mapear";
    let ignorada = false;
    if (Object.hasOwn(enviado, o.clave)) {
      const v = enviado[o.clave] ?? null;
      origen = "enviado";
      if (v === null) ignorada = true;
      else if (ids.has(v)) softwareId = v;
      else origen = "sin_mapear";
    } else if (guardado.has(o.clave)) {
      const v = guardado.get(o.clave) ?? null;
      origen = "guardado";
      if (v === null) ignorada = true;
      else if (ids.has(v)) softwareId = v;
      else origen = "sin_mapear";
    } else {
      const sugerido = sugerirPrograma(o.nombre, programas);
      if (sugerido) {
        softwareId = sugerido;
        origen = "sugerido";
      }
    }
    return { clave: o.clave, nombre: o.nombre, personas: o.personas, softwareId, origen, ignorada };
  });
}

/** Las filas de Autodesk del archivo, ya con su programa (las ofertas ignoradas o sin elegir quedan afuera). */
function filasMapeadas(archivo: ArchivoDeAutodesk, ofertas: readonly OfertaDeLaVistaPrevia[]): FilaDeAutodesk[] {
  const programaDe = new Map(ofertas.map((o) => [o.clave, o.softwareId] as const));
  const vistos = new Set<string>();
  const salida: FilaDeAutodesk[] = [];
  for (const l of archivo.licencias) {
    const softwareId = programaDe.get(claveDeOferta(l.offeringName));
    if (!softwareId) continue;
    const k = `${l.email}|${softwareId}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push({ email: l.email, softwareId, nombre: nombreDe(l), offeringName: l.offeringName });
  }
  return salida;
}

export async function vistaPreviaDeImportacion(
  org: string,
  entrada: {
    nombre: string;
    bytes: Uint8Array;
    teamId?: string;
    mapeo: MapeoDeOfertas;
    conDetalle: boolean;
  }
): Promise<ResultadoConFallo<VistaPreviaDeImportacion>> {
  const lectura = leerArchivoDeAutodesk(entrada.nombre, entrada.bytes);
  if (!lectura.ok) return fallo(422, lectura.code, lectura.message);
  const archivo = lectura.archivo;

  const [programas, guardado, equipos] = await Promise.all([
    programasDeLaOrganizacion(org),
    mapeoGuardado(org),
    getDb()
      .select({
        id: schema.licenseTeam.id,
        name: schema.licenseTeam.name,
        autodeskAlias: schema.licenseTeam.autodeskAlias,
        archivedAt: schema.licenseTeam.archivedAt,
      })
      .from(schema.licenseTeam)
      .where(scoped(schema.licenseTeam.organizationId, org)),
  ]);

  const claveAlias = archivo.teamAlias ? claveDeOferta(archivo.teamAlias) : null;
  const equipoPropuesto =
    claveAlias === null
      ? null
      : (equipos.find(
          (e) => e.archivedAt === null && e.autodeskAlias && claveDeOferta(e.autodeskAlias) === claveAlias
        )?.id ?? null);
  const elegido = entrada.teamId ? (equipos.find((e) => e.id === entrada.teamId) ?? null) : null;
  if (entrada.teamId && !elegido) return fallo(404, "not_found", "Equipo de licencias inexistente");

  let avisoDeEquipo: string | null = null;
  let puedeGuardarAlias = false;
  if (elegido && archivo.teamAlias) {
    if (elegido.autodeskAlias) {
      if (claveDeOferta(elegido.autodeskAlias) !== claveAlias) {
        avisoDeEquipo = `El archivo es del equipo «${archivo.teamAlias}» de Autodesk y «${elegido.name}» está vinculado a «${elegido.autodeskAlias}». Revisá que sea el equipo correcto.`;
      }
    } else {
      puedeGuardarAlias = true;
    }
  }

  const ofertas = ofertasConMapeo(archivo, guardado, entrada.mapeo, programas);
  const importable =
    Boolean(elegido) && !elegido?.archivedAt && ofertas.every((o) => o.ignorada || o.softwareId !== null);

  let conteo: Record<TipoDeCaso, number> | null = null;
  let casos: CasoDto[] = [];
  let truncado = false;
  if (elegido && !elegido.archivedAt) {
    const filas = filasMapeadas(archivo, ofertas);
    const plan = planDeConciliacion(await cargarEntrada(org, elegido.id, filas, { conHistorial: false }));
    conteo = contarCasos(plan.casos);
    const nombres = new Map(programas.map((p) => [p.id, p.name] as const));
    const aTrabajar = plan.casos.filter((c) => c.tipo !== "coincide");
    truncado = aTrabajar.length > TOPE_DE_LISTA;
    if (entrada.conDetalle) {
      casos = aTrabajar.slice(0, TOPE_DE_LISTA).map((c) => ({ ...c, programa: nombres.get(c.softwareId) ?? "" }));
    }
  }

  return {
    ok: true,
    data: {
      archivo: {
        fileName: entrada.nombre,
        filas: archivo.filas,
        personas: archivo.personas,
        sinLicencia: archivo.sinLicencia,
        filasSinCorreo: archivo.filasSinCorreo,
        teamAlias: archivo.teamAlias,
      },
      ofertas,
      equipoPropuesto,
      avisoDeEquipo,
      puedeGuardarAlias,
      importable,
      conteo,
      casos,
      truncado,
      detalleOculto: !entrada.conDetalle,
    },
  };
}

/* ============================================================
 * Importar
 * ============================================================ */

export type ResumenDeImportacion = {
  batchId: string;
  licencias: number;
  personas: number;
  ignoradas: number;
  tareasCerradas: number;
  conteo: Record<TipoDeCaso, number>;
};

const EN_LOTES = 500;

export async function importarArchivo(
  org: string,
  userId: string | null,
  entrada: {
    nombre: string;
    bytes: Uint8Array;
    teamId: string;
    mapeo: MapeoDeOfertas;
    guardarAlias: boolean;
  }
): Promise<ResultadoConFallo<ResumenDeImportacion>> {
  const lectura = leerArchivoDeAutodesk(entrada.nombre, entrada.bytes);
  if (!lectura.ok) return fallo(422, lectura.code, lectura.message);
  const archivo = lectura.archivo;

  const equipo = await buscarEquipo(org, entrada.teamId);
  if (!equipo) return fallo(404, "not_found", "Equipo de licencias inexistente");
  if (equipo.archived) return fallo(422, "equipo_archivado", "Ese equipo está archivado: elegí otro");

  const db = getDb();
  const [programas, guardado] = await Promise.all([programasDeLaOrganizacion(org), mapeoGuardado(org)]);
  // Para importar, TODA oferta tiene que estar resuelta: una sugerencia que nadie confirmó no cuenta.
  const ofertas = ofertasConMapeo(archivo, guardado, entrada.mapeo, programas).map((o) =>
    o.origen === "sugerido" ? { ...o, softwareId: null, origen: "sin_mapear" as const } : o
  );
  const sinMapear = ofertas.filter((o) => !o.ignorada && o.softwareId === null);
  if (sinMapear.length > 0) {
    return fallo(
      422,
      "ofertas_sin_mapear",
      `Elegí el programa de: ${sinMapear.map((o) => o.nombre).join(", ")} (o marcala como «no se gestiona»).`,
      { faltan: sinMapear.map((o) => o.nombre) }
    );
  }

  // Recordar el mapeo de TODAS las ofertas del archivo.
  for (const o of ofertas) {
    await db
      .insert(schema.licenseOfferingMap)
      .values({ organizationId: org, offeringKey: o.clave, offeringName: o.nombre, softwareId: o.softwareId })
      .onConflictDoUpdate({
        target: [schema.licenseOfferingMap.organizationId, schema.licenseOfferingMap.offeringKey],
        set: { offeringName: o.nombre, softwareId: o.softwareId, updatedAt: new Date() },
      });
  }

  if (entrada.guardarAlias && archivo.teamAlias) {
    const [actual] = await db
      .select({ autodeskAlias: schema.licenseTeam.autodeskAlias })
      .from(schema.licenseTeam)
      .where(scoped(schema.licenseTeam.organizationId, org, eq(schema.licenseTeam.id, equipo.id)))
      .limit(1);
    if (actual && !aliasNormalizado(actual.autodeskAlias)) {
      await db
        .update(schema.licenseTeam)
        .set({ autodeskAlias: archivo.teamAlias, updatedAt: new Date() })
        .where(scoped(schema.licenseTeam.organizationId, org, eq(schema.licenseTeam.id, equipo.id)));
    }
  }

  // La foto: una fila por (correo, programa).
  const programaDe = new Map(ofertas.map((o) => [o.clave, o.softwareId] as const));
  const filas = new Map<string, typeof schema.licenseImportRow.$inferInsert>();
  const batchId = newId("licenseImportBatch");
  let ignoradas = 0;
  for (const l of archivo.licencias) {
    const softwareId = programaDe.get(claveDeOferta(l.offeringName));
    if (!softwareId) {
      ignoradas++;
      continue;
    }
    const k = `${l.email}|${softwareId}`;
    if (filas.has(k)) continue;
    filas.set(k, {
      id: newId("licenseImportRow"),
      organizationId: org,
      batchId,
      teamId: equipo.id,
      softwareId,
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName,
      autodeskId: l.autodeskId,
      offeringName: l.offeringName,
      role: l.role,
      accountStatus: l.accountStatus,
    });
  }

  await db.insert(schema.licenseImportBatch).values({
    id: batchId,
    organizationId: org,
    teamId: equipo.id,
    fileName: entrada.nombre.slice(0, 200),
    uploadedBy: userId,
    people: archivo.personas,
    peopleWithoutLicense: archivo.sinLicencia,
    licenses: filas.size,
    ignored: ignoradas,
  });
  const lista = [...filas.values()];
  for (let i = 0; i < lista.length; i += EN_LOTES) {
    await db.insert(schema.licenseImportRow).values(lista.slice(i, i + EN_LOTES));
  }

  // Se conservan las últimas 6 importaciones del equipo.
  const lotes = await db
    .select({ id: schema.licenseImportBatch.id })
    .from(schema.licenseImportBatch)
    .where(scoped(schema.licenseImportBatch.organizationId, org, eq(schema.licenseImportBatch.teamId, equipo.id)))
    .orderBy(desc(schema.licenseImportBatch.uploadedAt), desc(schema.licenseImportBatch.id));
  const viejos = lotes.slice(IMPORTACIONES_POR_EQUIPO).map((l) => l.id);
  if (viejos.length > 0) {
    await db
      .delete(schema.licenseImportBatch)
      .where(scoped(schema.licenseImportBatch.organizationId, org, inArray(schema.licenseImportBatch.id, viejos)));
  }

  // Las tareas que el archivo ya muestra hechas se cierran solas.
  const abiertas = (
    await db
      .select()
      .from(schema.licenseAutodeskTask)
      .where(
        scoped(
          schema.licenseAutodeskTask.organizationId,
          org,
          eq(schema.licenseAutodeskTask.teamId, equipo.id),
          eq(schema.licenseAutodeskTask.status, "abierta")
        )
      )
  ).map(tareaAbierta);
  const aCerrar = tareasQueSeCierran(
    abiertas,
    lista.map((f) => ({ email: f.email, softwareId: f.softwareId })),
    equipo.id
  );
  if (aCerrar.length > 0) {
    await db
      .update(schema.licenseAutodeskTask)
      .set({ status: "cerrada", closedAt: new Date(), closedByBatchId: batchId })
      .where(scoped(schema.licenseAutodeskTask.organizationId, org, inArray(schema.licenseAutodeskTask.id, aCerrar)));
  }

  const autodesk: FilaDeAutodesk[] = lista.map((f) => ({
    email: f.email,
    softwareId: f.softwareId,
    nombre: nombreDe({ firstName: f.firstName ?? "", lastName: f.lastName ?? "", email: f.email }),
    offeringName: f.offeringName,
  }));
  const plan = planDeConciliacion(await cargarEntrada(org, equipo.id, autodesk, { conHistorial: false }));
  return {
    ok: true,
    data: {
      batchId,
      licencias: lista.length,
      personas: archivo.personas,
      ignoradas,
      tareasCerradas: aCerrar.length,
      conteo: contarCasos(plan.casos),
    },
  };
}

/* ============================================================
 * El reporte de trabajo
 * ============================================================ */

export type PendienteDto = {
  id: string;
  teamId: string;
  equipo: string;
  softwareId: string;
  programa: string;
  kind: TareaAbierta["kind"];
  email: string | null;
  persona: string | null;
  creadaEn: string;
};

export type EquipoDelReporte = {
  teamId: string;
  nombre: string;
  autodeskAlias: string | null;
  ultimaImportacion: {
    id: string;
    fileName: string;
    uploadedAt: string;
    por: string | null;
    licencias: number;
    personas: number;
  } | null;
  resumen: (ResumenDeAsientos & { programa: string })[];
  conteo: Record<TipoDeCaso, number> | null;
  casos: CasoDto[];
};

export type ReporteDeConciliacion = {
  equipos: EquipoDelReporte[];
  /** Los programas del campus, para elegir cuál es cada oferta de Autodesk. */
  programas: { id: string; name: string }[];
  pendientes: PendienteDto[];
  /** Sin `contactos.ver` no viajan correos ni personas: solo las cuentas. */
  detalleOculto: boolean;
};

/** El plan de un equipo desde su última importación guardada, o `null` si nunca importó. */
async function planGuardado(org: string, teamId: string, conHistorial: boolean) {
  const db = getDb();
  const [lote] = await db
    .select({
      id: schema.licenseImportBatch.id,
      fileName: schema.licenseImportBatch.fileName,
      uploadedAt: schema.licenseImportBatch.uploadedAt,
      licenses: schema.licenseImportBatch.licenses,
      people: schema.licenseImportBatch.people,
      por: schema.user.name,
    })
    .from(schema.licenseImportBatch)
    .leftJoin(schema.user, eq(schema.licenseImportBatch.uploadedBy, schema.user.id))
    .where(scoped(schema.licenseImportBatch.organizationId, org, eq(schema.licenseImportBatch.teamId, teamId)))
    .orderBy(desc(schema.licenseImportBatch.uploadedAt), desc(schema.licenseImportBatch.id))
    .limit(1);
  if (!lote) return null;
  const filas = await db
    .select({
      email: schema.licenseImportRow.email,
      softwareId: schema.licenseImportRow.softwareId,
      firstName: schema.licenseImportRow.firstName,
      lastName: schema.licenseImportRow.lastName,
      offeringName: schema.licenseImportRow.offeringName,
    })
    .from(schema.licenseImportRow)
    .where(scoped(schema.licenseImportRow.organizationId, org, eq(schema.licenseImportRow.batchId, lote.id)));
  const autodesk: FilaDeAutodesk[] = filas.map((f) => ({
    email: f.email,
    softwareId: f.softwareId,
    nombre: nombreDe(f),
    offeringName: f.offeringName,
  }));
  const entrada = await cargarEntrada(org, teamId, autodesk, { conHistorial });
  return { lote, autodesk, entrada, plan: planDeConciliacion(entrada) };
}

export async function reporteDeConciliacion(
  org: string,
  opts: { conDetalle: boolean; teamId?: string }
): Promise<ReporteDeConciliacion> {
  const db = getDb();
  const [equiposFilas, programas, cupos] = await Promise.all([
    db
      .select({
        id: schema.licenseTeam.id,
        name: schema.licenseTeam.name,
        autodeskAlias: schema.licenseTeam.autodeskAlias,
        archivedAt: schema.licenseTeam.archivedAt,
      })
      .from(schema.licenseTeam)
      .where(
        scoped(
          schema.licenseTeam.organizationId,
          org,
          opts.teamId ? eq(schema.licenseTeam.id, opts.teamId) : undefined
        )
      )
      .orderBy(asc(schema.licenseTeam.name)),
    programasDeLaOrganizacion(org),
    db
      .select({
        teamId: schema.licenseTeamSeat.teamId,
        softwareId: schema.licenseTeamSeat.softwareId,
        total: schema.licenseTeamSeat.total,
      })
      .from(schema.licenseTeamSeat)
      .where(scoped(schema.licenseTeamSeat.organizationId, org)),
  ]);
  const nombres = new Map(programas.map((p) => [p.id, p.name] as const));

  const equipos: EquipoDelReporte[] = [];
  for (const e of equiposFilas.filter((x) => x.archivedAt === null)) {
    const guardado = await planGuardado(org, e.id, true);
    if (!guardado) {
      equipos.push({
        teamId: e.id,
        nombre: e.name,
        autodeskAlias: e.autodeskAlias,
        ultimaImportacion: null,
        resumen: [],
        conteo: null,
        casos: [],
      });
      continue;
    }
    const cuposDelEquipo = new Map(cupos.filter((c) => c.teamId === e.id).map((c) => [c.softwareId, c.total] as const));
    const ocupadas = new Map<string, { alumnos: number; profesores: number }>();
    for (const t of guardado.entrada.titulares) {
      for (const l of t.licencias) {
        if (l.teamId !== e.id || !l.ocupa) continue;
        const previa = ocupadas.get(l.softwareId) ?? { alumnos: 0, profesores: 0 };
        if (t.ref.tipo === "profesor") previa.profesores++;
        else previa.alumnos++;
        ocupadas.set(l.softwareId, previa);
      }
    }
    equipos.push({
      teamId: e.id,
      nombre: e.name,
      autodeskAlias: e.autodeskAlias,
      ultimaImportacion: {
        id: guardado.lote.id,
        fileName: guardado.lote.fileName,
        uploadedAt: guardado.lote.uploadedAt.toISOString(),
        por: guardado.lote.por,
        licencias: guardado.lote.licenses,
        personas: guardado.lote.people,
      },
      resumen: resumenDeAsientos(guardado.plan, cuposDelEquipo, ocupadas, guardado.autodesk).map((r) => ({
        ...r,
        programa: nombres.get(r.softwareId) ?? "",
      })),
      conteo: contarCasos(guardado.plan.casos),
      casos: opts.conDetalle
        ? guardado.plan.casos.map((c) => ({ ...c, programa: nombres.get(c.softwareId) ?? "" }))
        : [],
    });
  }

  let pendientes: PendienteDto[] = [];
  if (opts.conDetalle) {
    const nombresDeEquipo = new Map(equiposFilas.map((e) => [e.id, e.name] as const));
    const tareas = await db
      .select()
      .from(schema.licenseAutodeskTask)
      .where(
        scoped(
          schema.licenseAutodeskTask.organizationId,
          org,
          eq(schema.licenseAutodeskTask.status, "abierta"),
          opts.teamId ? eq(schema.licenseAutodeskTask.teamId, opts.teamId) : undefined
        )
      )
      .orderBy(asc(schema.licenseAutodeskTask.createdAt));
    pendientes = tareas.map((t) => ({
      id: t.id,
      teamId: t.teamId,
      equipo: nombresDeEquipo.get(t.teamId) ?? "",
      softwareId: t.softwareId,
      programa: nombres.get(t.softwareId) ?? "",
      kind: t.kind,
      email: t.email,
      persona: t.personName,
      creadaEn: t.createdAt.toISOString(),
    }));
  }
  return { equipos, programas, pendientes, detalleOculto: !opts.conDetalle };
}

/* ============================================================
 * Acciones sobre un caso
 * ============================================================ */

type ResultadoDeAccion = { ok: true } | { ok: false; status: 404 | 409 | 422; code: string; message: string };

async function cerrarTareasDe(org: string, teamId: string, softwareId: string, subject: string) {
  await getDb()
    .update(schema.licenseAutodeskTask)
    .set({ status: "cerrada", closedAt: new Date() })
    .where(
      scoped(
        schema.licenseAutodeskTask.organizationId,
        org,
        eq(schema.licenseAutodeskTask.teamId, teamId),
        eq(schema.licenseAutodeskTask.softwareId, softwareId),
        eq(schema.licenseAutodeskTask.subject, subject),
        eq(schema.licenseAutodeskTask.status, "abierta")
      )
    );
}

async function ejecutar(
  org: string,
  userId: string | null,
  caso: CasoDeConciliacion,
  accion: AccionSobreCaso["accion"],
  params: Pick<AccionSobreCaso, "enrollmentId" | "nota" | "contactId" | "teacherId">
): Promise<ResultadoDeAccion> {
  const db = getDb();
  const subject = subjectDelCaso(caso);
  if (!caso.acciones.includes(accion)) {
    return fallo(422, "accion_no_permitida", "Esa acción no corresponde a este caso");
  }
  const dePersona = (r: { ok: boolean; status?: number; code?: string; message?: string }) =>
    r.ok
      ? ({ ok: true } as const)
      : fallo(
          (r.status === 404 || r.status === 409 ? r.status : 422) as 404 | 409 | 422,
          r.code ?? "invalid_body",
          r.message ?? "No se pudo aplicar"
        );

  switch (accion) {
    case "asignar": {
      if (caso.persona?.tipo === "profesor") {
        return dePersona(
          await assignTeacherLicense(org, caso.persona.teacherId, caso.softwareId, caso.teamId, {
            yaOcupaEnAutodesk: true,
          })
        );
      }
      const elegida = params.enrollmentId ?? caso.preseleccionada;
      const candidata = caso.candidatas.find((c) => c.enrollmentId === elegida);
      if (!candidata || candidata.bloqueo !== null || candidata.curso === "finalizada") {
        return fallo(422, "inscripcion_invalida", "Elegí una inscripción en marcha de esa persona");
      }
      const r = await assignLicense(org, candidata.enrollmentId, caso.softwareId, caso.teamId, {
        yaOcupaEnAutodesk: true,
      });
      if (r.ok) await cerrarTareasDe(org, caso.teamId, caso.softwareId, subject);
      return dePersona(r);
    }
    case "desmarcar": {
      if (caso.persona?.tipo === "profesor") {
        await unassignTeacherLicense(org, caso.persona.teacherId, caso.softwareId);
      } else if (caso.enrollmentId) {
        const r = await unassignLicense(org, caso.enrollmentId, caso.softwareId);
        if (!r.ok) return fallo(409, r.code, r.message);
      } else {
        return fallo(422, "invalid_body", "El caso no tiene una licencia que desmarcar");
      }
      await cerrarTareasDe(org, caso.teamId, caso.softwareId, subject);
      return { ok: true };
    }
    case "mover": {
      if (!caso.licenseId || !caso.destinoTeamId) {
        return fallo(422, "invalid_body", "El caso no tiene una licencia que mover");
      }
      return dePersona(
        await moverLicenciaDeEquipo(org, caso.licenseId, caso.destinoTeamId, { yaOcupaEnAutodesk: true })
      );
    }
    case "pendiente_en_autodesk":
    case "sacar_en_autodesk": {
      const kind = accion === "pendiente_en_autodesk" ? "asignar_en_autodesk" : "sacar_en_autodesk";
      await db
        .insert(schema.licenseAutodeskTask)
        .values({
          id: newId("licenseAutodeskTask"),
          organizationId: org,
          teamId: caso.teamId,
          softwareId: caso.softwareId,
          kind,
          subject,
          email: caso.email,
          contactId: caso.persona?.tipo === "alumno" ? caso.persona.contactId : null,
          teacherId: caso.persona?.tipo === "profesor" ? caso.persona.teacherId : null,
          personName: caso.nombre,
          createdBy: userId,
        })
        .onConflictDoNothing();
      return { ok: true };
    }
    case "mantener":
    case "omitir": {
      await db
        .insert(schema.licenseCaseResolution)
        .values({
          id: newId("licenseCaseResolution"),
          organizationId: org,
          teamId: caso.teamId,
          softwareId: caso.softwareId,
          subject,
          decision: accion,
          note: params.nota?.trim() || null,
          fingerprint: caso.huella,
          resolvedBy: userId,
        })
        .onConflictDoUpdate({
          target: [
            schema.licenseCaseResolution.teamId,
            schema.licenseCaseResolution.softwareId,
            schema.licenseCaseResolution.subject,
          ],
          set: { decision: accion, note: params.nota?.trim() || null, fingerprint: caso.huella, resolvedBy: userId, resolvedAt: new Date() },
        });
      return { ok: true };
    }
    case "vincular": {
      if (!caso.email) return fallo(422, "invalid_body", "El caso no tiene un correo para vincular");
      if (Boolean(params.contactId) === Boolean(params.teacherId)) {
        return fallo(422, "invalid_body", "Elegí una persona: un alumno o un profesor");
      }
      const existe = params.contactId
        ? await db
            .select({ id: schema.contact.id })
            .from(schema.contact)
            .where(scoped(schema.contact.organizationId, org, eq(schema.contact.id, params.contactId)))
            .limit(1)
        : await db
            .select({ id: schema.teacher.id })
            .from(schema.teacher)
            .where(scoped(schema.teacher.organizationId, org, eq(schema.teacher.id, params.teacherId!)))
            .limit(1);
      if (!existe[0]) return fallo(404, "not_found", "No encontramos a esa persona");
      await db
        .insert(schema.licenseEmailAlias)
        .values({
          id: newId("licenseEmailAlias"),
          organizationId: org,
          email: caso.email,
          contactId: params.contactId ?? null,
          teacherId: params.teacherId ?? null,
          createdBy: userId,
        })
        .onConflictDoUpdate({
          target: [schema.licenseEmailAlias.organizationId, schema.licenseEmailAlias.email],
          set: { contactId: params.contactId ?? null, teacherId: params.teacherId ?? null, createdBy: userId },
        });
      return { ok: true };
    }
  }
}

async function planActual(org: string, teamId: string): Promise<PlanDeConciliacion | null> {
  return (await planGuardado(org, teamId, false))?.plan ?? null;
}

export async function aplicarAccion(
  org: string,
  userId: string | null,
  accion: AccionSobreCaso
): Promise<ResultadoDeAccion> {
  const equipo = await buscarEquipo(org, accion.teamId);
  if (!equipo) return fallo(404, "not_found", "Equipo de licencias inexistente");
  const plan = await planActual(org, accion.teamId);
  if (!plan) return fallo(409, "sin_importacion", "Este equipo todavía no tiene una importación de Autodesk");
  const caso = plan.casos.find((c) => c.clave === accion.clave);
  if (!caso) {
    return fallo(404, "not_found", "Ese caso ya no existe: la situación cambió. Recargá el reporte.");
  }
  return ejecutar(org, userId, caso, accion.accion, accion);
}

export type ResultadoDeLoSeguro = {
  aplicadas: number;
  fallidas: { clave: string; nombre: string; message: string }[];
  /** Coincidencias exactas: ya están verificadas, no hay nada que escribir. */
  verificadas: number;
  porAccion: { asignar: number; desmarcar: number; mover: number };
};

/**
 * «Aplicar lo seguro»: asignar a quien tiene un único curso en marcha (o es
 * profesor), pasar de equipo lo que el campus tiene en otro y desmarcar lo que
 * ya terminó. Lo ambiguo, los externos y lo pendiente en Autodesk no se tocan.
 * Idempotente: una segunda corrida no encuentra nada seguro.
 */
export async function aplicarLoSeguro(
  org: string,
  userId: string | null,
  teamId: string,
  opts: { soloContar?: boolean } = {}
): Promise<ResultadoConFallo<ResultadoDeLoSeguro>> {
  const equipo = await buscarEquipo(org, teamId);
  if (!equipo) return fallo(404, "not_found", "Equipo de licencias inexistente");
  const plan = await planActual(org, teamId);
  if (!plan) return fallo(409, "sin_importacion", "Este equipo todavía no tiene una importación de Autodesk");

  const seguras = accionesSeguras(plan);
  const porAccion = { asignar: 0, desmarcar: 0, mover: 0 };
  const verificadas = plan.casos.filter((c) => c.tipo === "coincide").length;
  if (opts.soloContar) {
    for (const s of seguras) porAccion[s.accion]++;
    return { ok: true, data: { aplicadas: 0, fallidas: [], verificadas, porAccion } };
  }
  const fallidas: ResultadoDeLoSeguro["fallidas"] = [];
  let aplicadas = 0;
  for (const s of seguras) {
    const r = await ejecutar(org, userId, s.caso, s.accion, { enrollmentId: s.enrollmentId ?? undefined });
    if (r.ok) {
      aplicadas++;
      porAccion[s.accion]++;
    } else {
      fallidas.push({ clave: s.clave, nombre: s.caso.nombre, message: r.message });
    }
  }
  return { ok: true, data: { aplicadas, fallidas, verificadas, porAccion } };
}
