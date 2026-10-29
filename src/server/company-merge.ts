import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  datosDeEmpresaVacios,
  planDeUnificacionDeEmpresas,
  type BloqueoDeEmpresas,
  type DatosDeUnificacionDeEmpresas,
  type EmpresaAUnificar,
  type PlanDeUnificacionDeEmpresas,
} from "@/lib/company-merge";

/**
 * 2026-10-29 — Unificar empresas: la lectura y las escrituras.
 *
 * Las reglas viven en `src/lib/company-merge.ts`. Acá:
 *
 * 1. `prepararUnificacionDeEmpresas` BLOQUEA las dos filas de `company`
 *    (`for update`) y cuenta lo que apunta a la absorbida. El bloqueo hace
 *    que nadie le cuelgue una inscripción o un contacto nuevo a ninguna de
 *    las dos mientras dura el pedido (toda FK hacia `company` espera), así
 *    que lo que el POST vuelve a planear es lo que se ejecuta. La vista
 *    previa es un aviso, no la barrera.
 * 2. `aplicarUnificacionDeEmpresas` mueve TODO lo que apunta a la absorbida,
 *    completa la que queda y recién al final borra la absorbida. Si algo
 *    bloquea, LANZA: la transacción del pedido (`withAuth`) revierte todo.
 *
 * Lo que apunta a `company.id` (`tests/unit/company-merge-servidor.test.ts`
 * falla si aparece una FK nueva sin nombrarla acá):
 * - `contact.company_id` (set null) — la empresa de la persona.
 * - `enrollment.company_id` (RESTRICT) — sin moverla, el borrado falla.
 * - `offline_course_grant.via_company_id` (set null) — informativo.
 * - `historical_course_taking.company_id` (set null). Su `dedup_key` es
 *   `<contacto>|<curso>|<fecha>` (`dedupKey` de
 *   `src/lib/historial-import/plan.ts`): NO lleva la empresa, así que
 *   cambiarla no puede chocar con `historical_course_taking_org_dedup_uq`.
 * - Sin FK: `companyIds` en los filtros jsonb de `marketing_audience` y de
 *   las campañas en BORRADOR (`marketing_campaign.filters`). Las campañas
 *   enviando / enviadas / canceladas tienen sus destinatarios congelados y
 *   sus filtros son historia: no se tocan.
 *
 * Lo congelado NO se reescribe: el payload de los avisos internos
 * (`staff_notice`) guarda la razón social y el RUT como TEXTO, y el
 * historial importado no guarda ids de empresa en `mapping` ni en
 * `pending_rows` (filas crudas con el nombre escrito).
 */

export class UnificacionDeEmpresasBloqueada extends Error {
  constructor(readonly bloqueos: BloqueoDeEmpresas[]) {
    super(bloqueos.map((b) => b.mensaje).join(" "));
    this.name = "UnificacionDeEmpresasBloqueada";
  }
}

const COLUMNAS_DE_EMPRESA = {
  id: schema.company.id,
  legalName: schema.company.legalName,
  tradeName: schema.company.tradeName,
  taxId: schema.company.taxId,
  addressStreet: schema.company.addressStreet,
  addressCity: schema.company.addressCity,
  addressState: schema.company.addressState,
  addressCountry: schema.company.addressCountry,
  billingContactName: schema.company.billingContactName,
  billingEmail: schema.company.billingEmail,
  billingPhone: schema.company.billingPhone,
  paymentTerms: schema.company.paymentTerms,
  paymentTermDays: schema.company.paymentTermDays,
  notes: schema.company.notes,
  excludeFromReports: schema.company.excludeFromReports,
};

export type PreparacionDeEmpresas = {
  kept: EmpresaAUnificar;
  absorbed: EmpresaAUnificar;
  plan: PlanDeUnificacionDeEmpresas;
};

/**
 * Lee (y bloquea) las dos empresas, cuenta lo que apunta a la absorbida y
 * arma el plan. `null` si alguna no es de esta organización (la ruta
 * responde 404).
 */
export async function prepararUnificacionDeEmpresas(
  organizationId: string,
  keptId: string,
  absorbedId: string
): Promise<PreparacionDeEmpresas | null> {
  const db = getDb();
  const filas = await db
    .select(COLUMNAS_DE_EMPRESA)
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, inArray(schema.company.id, [keptId, absorbedId])))
    .for("update");
  const kept = filas.find((c) => c.id === keptId);
  const absorbed = filas.find((c) => c.id === absorbedId);
  if (!kept || !absorbed) return null;

  const datos = await leerDatos(organizationId, absorbedId);
  return { kept, absorbed, plan: planDeUnificacionDeEmpresas(kept, absorbed, datos) };
}

async function leerDatos(organizationId: string, absorbedId: string): Promise<DatosDeUnificacionDeEmpresas> {
  const db = getDb();
  const datos = datosDeEmpresaVacios();
  const contar = sql<number>`count(*)::int`;

  const [contactos] = await db
    .select({ n: contar })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.companyId, absorbedId)));
  const [inscripciones] = await db
    .select({ n: contar })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.companyId, absorbedId)));
  const [accesos] = await db
    .select({ n: contar })
    .from(schema.offlineCourseGrant)
    .where(
      scoped(
        schema.offlineCourseGrant.organizationId,
        organizationId,
        eq(schema.offlineCourseGrant.viaCompanyId, absorbedId)
      )
    );
  const [historial] = await db
    .select({ n: contar })
    .from(schema.historicalCourseTaking)
    .where(
      scoped(
        schema.historicalCourseTaking.organizationId,
        organizationId,
        eq(schema.historicalCourseTaking.companyId, absorbedId)
      )
    );
  datos.conteos = {
    contactos: Number(contactos?.n ?? 0),
    inscripciones: Number(inscripciones?.n ?? 0),
    accesosOffline: Number(accesos?.n ?? 0),
    cursadasHistoricas: Number(historial?.n ?? 0),
  };

  // Filtros de marketing que nombran a la absorbida (`companyIds`).
  const nombra = (col: typeof schema.marketingAudience.filters | typeof schema.marketingCampaign.filters) =>
    sql`(${col} -> 'companyIds') @> jsonb_build_array(${absorbedId}::text)`;
  const audiencias = await db
    .select({ id: schema.marketingAudience.id, filters: schema.marketingAudience.filters })
    .from(schema.marketingAudience)
    .where(scoped(schema.marketingAudience.organizationId, organizationId, nombra(schema.marketingAudience.filters)));
  const campanas = await db
    .select({ id: schema.marketingCampaign.id, filters: schema.marketingCampaign.filters })
    .from(schema.marketingCampaign)
    .where(
      scoped(
        schema.marketingCampaign.organizationId,
        organizationId,
        eq(schema.marketingCampaign.status, "borrador"),
        nombra(schema.marketingCampaign.filters)
      )
    );
  datos.filtros = [
    ...audiencias.map((a) => ({ tabla: "marketing_audience" as const, id: a.id, filters: a.filters })),
    ...campanas.flatMap((c) =>
      c.filters ? [{ tabla: "marketing_campaign" as const, id: c.id, filters: c.filters as Record<string, unknown> }] : []
    ),
  ];
  return datos;
}

/**
 * Ejecuta el plan. LANZA si el plan tiene bloqueos: la transacción del
 * pedido revierte y no queda nada a medias. Devuelve el id de la que queda.
 */
export async function aplicarUnificacionDeEmpresas(
  organizationId: string,
  plan: PlanDeUnificacionDeEmpresas
): Promise<string> {
  if (plan.bloqueos.length > 0) throw new UnificacionDeEmpresasBloqueada(plan.bloqueos);

  const db = getDb();
  const now = new Date();
  const s = plan.keptId;
  const x = plan.absorbedId;

  // 1. Todo lo que apunta a la absorbida pasa a la que queda.
  await db
    .update(schema.contact)
    .set({ companyId: s, updatedAt: now })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.companyId, x)));
  await db
    .update(schema.enrollment)
    .set({ companyId: s, updatedAt: now })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.companyId, x)));
  await db
    .update(schema.offlineCourseGrant)
    .set({ viaCompanyId: s })
    .where(
      scoped(schema.offlineCourseGrant.organizationId, organizationId, eq(schema.offlineCourseGrant.viaCompanyId, x))
    );
  // La llave del historial no lleva la empresa: se cambia sin reclavar.
  await db
    .update(schema.historicalCourseTaking)
    .set({ companyId: s })
    .where(
      scoped(
        schema.historicalCourseTaking.organizationId,
        organizationId,
        eq(schema.historicalCourseTaking.companyId, x)
      )
    );

  // 2. Los filtros de marketing que la nombraban (ya reapuntados por el plan).
  for (const f of plan.filtros) {
    if (f.tabla === "marketing_audience") {
      await db
        .update(schema.marketingAudience)
        .set({ filters: f.filters, updatedAt: now })
        .where(scoped(schema.marketingAudience.organizationId, organizationId, eq(schema.marketingAudience.id, f.id)));
    } else {
      await db
        .update(schema.marketingCampaign)
        .set({ filters: f.filters, updatedAt: now })
        .where(
          scoped(
            schema.marketingCampaign.organizationId,
            organizationId,
            eq(schema.marketingCampaign.id, f.id),
            eq(schema.marketingCampaign.status, "borrador")
          )
        );
    }
  }

  // 3. La que queda se completa (la condición de pago, de a par en UNA sentencia).
  if (Object.keys(plan.empresa).length > 0) {
    await db
      .update(schema.company)
      .set({ ...plan.empresa, updatedAt: now })
      .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, s)));
  }

  // 4. La absorbida ya no tiene nada colgado: se borra.
  await db
    .delete(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, x)));

  return s;
}
