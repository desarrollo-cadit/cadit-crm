import { desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { identidadProvisional, normalizarCorreo } from "@/lib/contact-identity";
import { leerPlanilla, type FilaHistorica, type ProblemaDeFila } from "@/lib/historial-import/planilla";
import {
  ETIQUETA_FUENTE,
  FILAS_POR_TANDA,
  MapeoSchema,
  dedupKey,
  planDeImportacion,
  sugerirCurso,
  sugerirVendedor,
  validarMapeo,
  type EstadoParaPlan,
  type Mapeo,
} from "@/lib/historial-import/plan";

/**
 * 046 US6 (FR-014…FR-020) — Importar el historial 2020–2024 desde la app.
 *
 * Las reglas son puras (`src/lib/historial-import/`); acá se lee el estado de
 * la base, se aplica el plan y se lleva la cuenta. Cada tanda corre en la
 * transacción del pedido (`withAuth` → `app.current_org`): si algo lanza, esa
 * tanda se revierte entera y se puede reintentar sin duplicar.
 *
 * No lee plata. Quién puede importar lo decide la ruta (`historial.importar`).
 */

export type ImportacionDto = {
  id: string;
  sourceLabel: string;
  fileName: string | null;
  status: "aplicando" | "aplicada" | "deshecha";
  totalRows: number;
  processedRows: number;
  problemRows: number;
  contactsCreated: number;
  contactsCompleted: number;
  companiesCreated: number;
  takingsCreated: number;
  takingsExisting: number;
  importedByName: string | null;
  createdAt: string;
  finishedAt: string | null;
  undoneAt: string | null;
};

export type AnalisisDto = {
  totalFilas: number;
  filasValidas: number;
  problemas: ProblemaDeFila[];
  cursos: { label: string; filas: number; sugerido: string | null }[];
  vendedores: { raw: string; filas: number; sugerido: string | null }[];
  catalogo: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
};

export type VistaPreviaDto = {
  contactos: { crear: number; completar: number; sinCambios: number };
  empresas: { crear: number };
  cursadas: { nuevas: number; yaPresentes: number };
  problemas: ProblemaDeFila[];
};

type Fallo = { ok: false; code: "invalid_csv" | "invalid_mapping"; message: string };

/* ============================================================
 * Lecturas
 * ============================================================ */

/** Cursos del catálogo (sin talleres: no son cursadas) y vendedores activos. */
async function opcionesDeAsociacion(organizationId: string) {
  const db = getDb();
  const [catalogo, sellers] = await Promise.all([
    db
      .select({ id: schema.course.id, name: schema.course.name })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, ne(schema.course.kind, "taller")))
      .orderBy(schema.course.name),
    db
      .select({ id: schema.seller.id, name: schema.seller.name })
      .from(schema.seller)
      .where(scoped(schema.seller.organizationId, organizationId, sql`${schema.seller.archivedAt} is null`))
      .orderBy(schema.seller.name),
  ]);
  return { catalogo, sellers };
}

/** Lo que el plan necesita saber de la base: contactos, empresas y cursadas ya importadas. */
async function estadoParaPlan(organizationId: string): Promise<EstadoParaPlan> {
  const db = getDb();
  const ct = schema.contact;
  const contactos = await db
    .select({
      id: ct.id,
      firstName: ct.firstName,
      lastName: ct.lastName,
      email: ct.email,
      phone: ct.phone,
      waIdentity: ct.waIdentity,
      companyId: ct.companyId,
    })
    .from(ct)
    .where(scoped(ct.organizationId, organizationId));
  const empresas = await db
    .select({ id: schema.company.id, legalName: schema.company.legalName, tradeName: schema.company.tradeName })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId));
  const h = schema.historicalCourseTaking;
  const existentes = await db
    .select({ dedupKey: h.dedupKey })
    .from(h)
    .where(scoped(h.organizationId, organizationId));
  return {
    contactos: contactos.map((c) => ({ ...c, email: normalizarCorreo(c.email) })),
    empresas,
    cursadasExistentes: new Set(existentes.map((e) => e.dedupKey)),
  };
}

async function validar(
  organizationId: string,
  csv: string,
  mapeo: Mapeo
): Promise<Fallo | { ok: true; filas: FilaHistorica[]; problemas: ProblemaDeFila[] }> {
  const leida = leerPlanilla(csv);
  if (!leida.ok) return { ok: false, code: "invalid_csv", message: leida.message };
  const { catalogo, sellers } = await opcionesDeAsociacion(organizationId);
  const error = validarMapeo(leida.filas, mapeo, {
    cursos: new Set(catalogo.map((c) => c.id)),
    sellers: new Set(sellers.map((s) => s.id)),
  });
  if (error) return { ok: false, code: "invalid_mapping", message: error };
  return { ok: true, filas: leida.filas, problemas: leida.problemas };
}

/* ============================================================
 * Paso 1 y paso 2: sin escribir nada
 * ============================================================ */

export async function analizarPlanilla(
  organizationId: string,
  csv: string
): Promise<Fallo | { ok: true; analisis: AnalisisDto }> {
  const leida = leerPlanilla(csv);
  if (!leida.ok) return { ok: false, code: "invalid_csv", message: leida.message };
  const { catalogo, sellers } = await opcionesDeAsociacion(organizationId);

  const contar = (valores: string[]) => {
    const m = new Map<string, number>();
    for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  };
  return {
    ok: true,
    analisis: {
      totalFilas: leida.total,
      filasValidas: leida.filas.length,
      problemas: leida.problemas,
      cursos: contar(leida.filas.map((f) => f.curso)).map(([label, filas]) => ({
        label,
        filas,
        sugerido: sugerirCurso(label, catalogo),
      })),
      vendedores: contar(leida.filas.map((f) => f.vendedor).filter(Boolean)).map(([raw, filas]) => ({
        raw,
        filas,
        sugerido: sugerirVendedor(raw, sellers),
      })),
      catalogo,
      sellers,
    },
  };
}

export async function vistaPrevia(
  organizationId: string,
  csv: string,
  mapeo: Mapeo
): Promise<Fallo | { ok: true; vista: VistaPreviaDto }> {
  const v = await validar(organizationId, csv, mapeo);
  if (!v.ok) return v;
  const plan = planDeImportacion(v.filas, mapeo, await estadoParaPlan(organizationId));
  return { ok: true, vista: { ...plan.conteo, problemas: v.problemas } };
}

/* ============================================================
 * Paso 3: confirmar y aplicar por tandas
 * ============================================================ */

function seleccionDeImportacion() {
  const b = schema.historicalImportBatch;
  return getDb()
    .select({
      id: b.id,
      sourceLabel: b.sourceLabel,
      fileName: b.fileName,
      status: b.status,
      mapping: b.mapping,
      pendingRows: b.pendingRows,
      totalRows: b.totalRows,
      processedRows: b.processedRows,
      problemRows: b.problemRows,
      contactsCreated: b.contactsCreated,
      contactsCompleted: b.contactsCompleted,
      companiesCreated: b.companiesCreated,
      takingsCreated: b.takingsCreated,
      takingsExisting: b.takingsExisting,
      importedByName: schema.user.name,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
      undoneAt: b.undoneAt,
    })
    .from(b)
    .leftJoin(schema.user, eq(schema.user.id, b.importedBy));
}

type FilaDeImportacion = Awaited<ReturnType<ReturnType<typeof seleccionDeImportacion>["where"]>>[number];

/** Solo lo del contrato: las filas pendientes (datos personales) no viajan. */
function aDto(b: FilaDeImportacion): ImportacionDto {
  return {
    id: b.id,
    sourceLabel: b.sourceLabel,
    fileName: b.fileName,
    status: b.status,
    totalRows: b.totalRows,
    processedRows: b.processedRows,
    problemRows: b.problemRows,
    contactsCreated: b.contactsCreated,
    contactsCompleted: b.contactsCompleted,
    companiesCreated: b.companiesCreated,
    takingsCreated: b.takingsCreated,
    takingsExisting: b.takingsExisting,
    importedByName: b.importedByName,
    createdAt: b.createdAt.toISOString(),
    finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
    undoneAt: b.undoneAt ? b.undoneAt.toISOString() : null,
  };
}

async function leerImportacion(organizationId: string, id: string): Promise<FilaDeImportacion | null> {
  const b = schema.historicalImportBatch;
  const [fila] = await seleccionDeImportacion()
    .where(scoped(b.organizationId, organizationId, eq(b.id, id)))
    .limit(1);
  return fila ?? null;
}

export async function listarImportaciones(organizationId: string): Promise<ImportacionDto[]> {
  const b = schema.historicalImportBatch;
  const filas = await seleccionDeImportacion()
    .where(scoped(b.organizationId, organizationId))
    .orderBy(desc(b.createdAt));
  return filas.map(aDto);
}

/** Confirma: guarda las filas válidas y el mapeo; las tandas las aplica `aplicarTanda`. */
export async function crearImportacion(
  organizationId: string,
  userId: string,
  input: { csv: string; mapeo: Mapeo; fileName?: string | null }
): Promise<Fallo | { ok: true; importacion: ImportacionDto }> {
  const v = await validar(organizationId, input.csv, input.mapeo);
  if (!v.ok) return v;
  const id = newId("historicalImportBatch");
  await getDb()
    .insert(schema.historicalImportBatch)
    .values({
      id,
      organizationId,
      sourceLabel: ETIQUETA_FUENTE,
      fileName: input.fileName?.trim() || null,
      status: v.filas.length === 0 ? "aplicada" : "aplicando",
      mapping: input.mapeo,
      pendingRows: v.filas.length === 0 ? null : v.filas,
      totalRows: v.filas.length,
      problemRows: v.problemas.length,
      importedBy: userId,
      finishedAt: v.filas.length === 0 ? new Date() : null,
    });
  const creada = await leerImportacion(organizationId, id);
  if (!creada) throw new Error("historial: la importación recién creada no se pudo leer");
  return { ok: true, importacion: aDto(creada) };
}

/**
 * Aplica las siguientes `FILAS_POR_TANDA` filas. `null` = no es de esta
 * organización. Retomable: el avance vive en `processed_rows` y las cursadas
 * se insertan con `on conflict do nothing` sobre `dedup_key`.
 */
export async function aplicarTanda(
  organizationId: string,
  id: string
): Promise<ImportacionDto | { error: "no_aplicable" } | null> {
  const batch = await leerImportacion(organizationId, id);
  if (!batch) return null;
  if (batch.status === "deshecha") return { error: "no_aplicable" };
  if (batch.status === "aplicada") return aDto(batch);

  const pendientes = (batch.pendingRows ?? []) as FilaHistorica[];
  const tanda = pendientes.slice(batch.processedRows, batch.processedRows + FILAS_POR_TANDA);
  const mapeo = MapeoSchema.parse(batch.mapping);
  const plan = planDeImportacion(tanda, mapeo, await estadoParaPlan(organizationId));
  const db = getDb();
  const refs = new Map<string, string>();
  const resolver = (ref: string | null) => (ref === null ? null : (refs.get(ref) ?? ref));

  // 1. Empresas nuevas.
  if (plan.empresasNuevas.length > 0) {
    const nuevas = plan.empresasNuevas.map((e) => ({ id: newId("company"), organizationId, legalName: e.nombre }));
    await db.insert(schema.company).values(nuevas);
    plan.empresasNuevas.forEach((e, i) => refs.set(e.clave, nuevas[i]!.id));
  }

  // 2. Contactos nuevos (sin teléfono: identidad provisional, que nunca recibe WhatsApp).
  if (plan.contactosNuevos.length > 0) {
    const nuevos = plan.contactosNuevos.map((c) => {
      const idNuevo = newId("contact");
      refs.set(c.clave, idNuevo);
      return {
        id: idNuevo,
        organizationId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        waIdentity: c.phone ?? identidadProvisional(idNuevo),
        companyId: resolver(c.companyRef),
        source: c.source,
      };
    });
    await db.insert(schema.contact).values(nuevos);
  }

  // 3. Completar contactos existentes: `coalesce` en la base, así nunca pisa
  //    aunque alguien haya cargado el dato entre la lectura y esta escritura.
  const ct = schema.contact;
  for (const { contactId, cambios } of plan.completar) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (cambios.lastName) set.lastName = sql`coalesce(${ct.lastName}, ${cambios.lastName})`;
    if (cambios.email) set.email = sql`coalesce(${ct.email}, ${cambios.email})`;
    if (cambios.phone) set.phone = sql`coalesce(${ct.phone}, ${cambios.phone})`;
    if (cambios.waIdentity) {
      set.waIdentity = sql`case when ${ct.waIdentity} like 'sinwa:%' then ${cambios.waIdentity} else ${ct.waIdentity} end`;
    }
    if (cambios.companyRef) set.companyId = sql`coalesce(${ct.companyId}, ${resolver(cambios.companyRef)})`;
    await db.update(ct).set(set).where(scoped(ct.organizationId, organizationId, eq(ct.id, contactId)));
  }

  // 4. Cursadas históricas: una por persona, curso y día.
  let creadas = 0;
  if (plan.cursadas.length > 0) {
    const filas = plan.cursadas.map((c) => {
      const contactId = resolver(c.contactRef)!;
      return {
        id: newId("historicalCourseTaking"),
        organizationId,
        contactId,
        courseId: c.courseId,
        courseLabel: c.courseLabel,
        originalLabel: c.originalLabel,
        takenOn: new Date(`${c.fecha}T00:00:00Z`),
        companyId: resolver(c.companyRef),
        sellerId: c.sellerId,
        isStudent: c.isStudent,
        edition: c.edition,
        note: c.note,
        sourceLabel: batch.sourceLabel,
        sourceRow: c.sourceRow,
        batchId: batch.id,
        dedupKey: dedupKey(contactId, c.courseId, c.courseLabel, c.fecha),
      };
    });
    const insertadas = await db
      .insert(schema.historicalCourseTaking)
      .values(filas)
      .onConflictDoNothing({
        target: [schema.historicalCourseTaking.organizationId, schema.historicalCourseTaking.dedupKey],
      })
      .returning({ id: schema.historicalCourseTaking.id });
    creadas = insertadas.length;
  }

  // 5. La cuenta.
  const procesadas = batch.processedRows + tanda.length;
  const termino = procesadas >= pendientes.length;
  const b = schema.historicalImportBatch;
  await db
    .update(b)
    .set({
      processedRows: procesadas,
      contactsCreated: batch.contactsCreated + plan.contactosNuevos.length,
      contactsCompleted: batch.contactsCompleted + plan.completar.length,
      companiesCreated: batch.companiesCreated + plan.empresasNuevas.length,
      takingsCreated: batch.takingsCreated + creadas,
      takingsExisting: batch.takingsExisting + (tanda.length - creadas),
      ...(termino ? { status: "aplicada" as const, finishedAt: new Date(), pendingRows: null } : {}),
    })
    .where(scoped(b.organizationId, organizationId, eq(b.id, batch.id)));

  const releida = await leerImportacion(organizationId, batch.id);
  return releida ? aDto(releida) : null;
}

/**
 * "Deshacer esta importación" (DV-016): borra SUS cursadas históricas.
 * Contactos y empresas quedan (pueden tener ya otra actividad). `null` = no
 * es de esta organización.
 */
export async function deshacerImportacion(
  organizationId: string,
  userId: string,
  id: string
): Promise<ImportacionDto | null> {
  const batch = await leerImportacion(organizationId, id);
  if (!batch) return null;
  if (batch.status === "deshecha") return aDto(batch);
  const db = getDb();
  const h = schema.historicalCourseTaking;
  await db.delete(h).where(scoped(h.organizationId, organizationId, eq(h.batchId, batch.id))).returning({ id: h.id });
  const b = schema.historicalImportBatch;
  await db
    .update(b)
    .set({ status: "deshecha", undoneAt: new Date(), undoneBy: userId, pendingRows: null })
    .where(scoped(b.organizationId, organizationId, eq(b.id, batch.id)));
  const releida = await leerImportacion(organizationId, batch.id);
  return releida ? aDto(releida) : null;
}
