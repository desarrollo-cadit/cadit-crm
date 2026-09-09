import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES } from "@/lib/db/schema";
import { scoped } from "@/lib/db/tenant";

/**
 * 011 — Carga rápida de los datos de gestión que están en cero.
 *
 * El patrón que funcionó en la 022 y que acá se repite: **la función no
 * faltaba, faltaba poder usarla sobre muchos registros**. Editar 34 cursos o 7
 * profesores de a uno, abriendo un formulario cada vez, es trabajo que no se
 * hace — y por eso el precio de lista estaba en 0 de 41 cohortes y ninguno de
 * los 7 profesores tenía correo.
 *
 * No hay magia: se guarda lo que el dueño escribe. Lo único que aporta es que
 * pueda escribirlo todo junto y ver de una qué falta.
 */

export type CursoParaPrecio = {
  id: string;
  name: string;
  listPrice: number | null;
  listCurrency: string | null;
  /** Cuántas cohortes lo usan: dice cuánto rinde cargarle el precio. */
  cohortes: number;
  /** Cuántas de esas cohortes tienen precio propio y NO heredarían. */
  cohortesConPrecioPropio: number;
};

/**
 * Los cursos con lo que hace falta para decidir el precio, ordenados por
 * cuántas cohortes destraban. Cargar el precio del curso que tiene 12
 * cohortes rinde doce veces más que el que tiene una.
 */
export async function cursosParaPrecio(
  organizationId: string
): Promise<CursoParaPrecio[]> {
  const db = getDb();

  const cursos = await db
    .select({
      id: schema.course.id,
      name: schema.course.name,
      listPrice: schema.course.listPrice,
      listCurrency: schema.course.listCurrency,
    })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId));

  const cohortes = await db
    .select({ courseId: schema.cohort.courseId, cost: schema.cohort.cost })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId));

  const cuenta = new Map<string, { total: number; propias: number }>();
  for (const c of cohortes) {
    const acc = cuenta.get(c.courseId) ?? { total: 0, propias: 0 };
    acc.total += 1;
    if (c.cost !== null && c.cost > 0) acc.propias += 1;
    cuenta.set(c.courseId, acc);
  }

  return cursos
    .map((c) => ({
      ...c,
      cohortes: cuenta.get(c.id)?.total ?? 0,
      cohortesConPrecioPropio: cuenta.get(c.id)?.propias ?? 0,
    }))
    .sort((a, b) => {
      // Primero los que FALTAN, y dentro de esos los que más rinden.
      const faltaA = a.listPrice === null ? 1 : 0;
      const faltaB = b.listPrice === null ? 1 : 0;
      return faltaB - faltaA || b.cohortes - a.cohortes;
    });
}

export type ResultadoCarga = { guardados: number; sinCambios: number };

/**
 * Guarda varios precios de curso de una vez.
 *
 * Un valor vacío BORRA el precio en vez de ignorarse: si alguien limpia el
 * campo es porque quiere sacarlo, y tragarse esa intención en silencio es
 * peor que aplicarla.
 */
/** La moneda, validada contra la lista cerrada del schema. */
export type Moneda = (typeof CURRENCIES)[number];

/** Un texto suelto no es una moneda: lo que no está en la lista cae a UYU. */
function comoMoneda(valor: string | null | undefined): Moneda {
  return CURRENCIES.includes(valor as Moneda) ? (valor as Moneda) : "UYU";
}

export async function guardarPreciosDeCurso(
  organizationId: string,
  precios: { courseId: string; listPrice: number | null; listCurrency: string | null }[]
): Promise<ResultadoCarga> {
  if (precios.length === 0) return { guardados: 0, sinCambios: 0 };

  const db = getDb();
  let guardados = 0;

  for (const p of precios) {
    const r = await db
      .update(schema.course)
      .set({
        listPrice: p.listPrice,
        // Sin precio no hay moneda que guardar: dejar la moneda suelta
        // permite el estado imposible "moneda sin importe".
        listCurrency: p.listPrice === null ? null : comoMoneda(p.listCurrency),
        updatedAt: new Date(),
      })
      .where(
        scoped(schema.course.organizationId, organizationId, eq(schema.course.id, p.courseId))
      )
      .returning({ id: schema.course.id });
    if (r.length > 0) guardados += 1;
  }

  return { guardados, sinCambios: precios.length - guardados };
}

export type ProfesorParaCorreo = {
  id: string;
  name: string;
  email: string | null;
  /** Cohortes a su cargo: cuántas personas dependen de que pueda entrar. */
  cohortes: number;
  /** Si ya tiene cuenta de portal. */
  tieneAcceso: boolean;
};

/**
 * Los profesores con lo que hace falta para invitarlos.
 *
 * El dato medido que justifica la pantalla: **0 de 7 tienen correo**, así que
 * ninguno puede entrar al portal que la 014 dejó construido y probado. Y uno
 * solo de ellos —Ovidio— tiene 18 cohortes a cargo.
 */
export async function profesoresParaCorreo(
  organizationId: string
): Promise<ProfesorParaCorreo[]> {
  const db = getDb();

  const profes = await db
    .select({
      id: schema.teacher.id,
      name: schema.teacher.name,
      email: schema.teacher.email,
    })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId));

  if (profes.length === 0) return [];

  const cohortes = await db
    .select({ teacherId: schema.cohort.teacherId })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        inArray(
          schema.cohort.teacherId,
          profes.map((p) => p.id)
        )
      )
    );
  const cuenta = new Map<string, number>();
  for (const c of cohortes) {
    if (c.teacherId) cuenta.set(c.teacherId, (cuenta.get(c.teacherId) ?? 0) + 1);
  }

  const conAcceso = await db
    .select({ teacherId: schema.accountLink.teacherId })
    .from(schema.accountLink)
    .where(
      and(
        eq(schema.accountLink.organizationId, organizationId),
        eq(schema.accountLink.kind, "profesor"),
        isNull(schema.accountLink.suspendedAt)
      )
    );
  const yaEntran = new Set(conAcceso.map((a) => a.teacherId));

  return profes
    .map((p) => ({
      ...p,
      cohortes: cuenta.get(p.id) ?? 0,
      tieneAcceso: yaEntran.has(p.id),
    }))
    // Primero los que no tienen correo, y de esos los que más cohortes tienen:
    // el que da 18 clases importa más que el que da una.
    .sort((a, b) => {
      const faltaA = a.email ? 0 : 1;
      const faltaB = b.email ? 0 : 1;
      return faltaB - faltaA || b.cohortes - a.cohortes;
    });
}

/**
 * Guarda varios correos de profesor de una vez.
 *
 * **No invita a nadie.** Cargar el correo y mandar la invitación son dos actos
 * distintos y así se quedan: un correo no se puede desenviar, y la 012 dejó
 * escrito que el envío es siempre explícito y de a uno.
 */
export async function guardarCorreosDeProfesor(
  organizationId: string,
  correos: { teacherId: string; email: string | null }[]
): Promise<ResultadoCarga> {
  if (correos.length === 0) return { guardados: 0, sinCambios: 0 };

  const db = getDb();
  let guardados = 0;

  for (const c of correos) {
    const limpio = c.email?.trim().toLowerCase() || null;
    const r = await db
      .update(schema.teacher)
      .set({ email: limpio, updatedAt: new Date() })
      .where(
        scoped(
          schema.teacher.organizationId,
          organizationId,
          eq(schema.teacher.id, c.teacherId)
        )
      )
      .returning({ id: schema.teacher.id });
    if (r.length > 0) guardados += 1;
  }

  return { guardados, sinCambios: correos.length - guardados };
}

/**
 * El estado de la carga de gestión, en números.
 *
 * Es lo que la pantalla muestra arriba para que el trabajo tenga un final
 * visible: "faltan 34 precios" es una tarea; "cargá los precios" es un cartel.
 */
export async function estadoDeCarga(organizationId: string): Promise<{
  cursosSinPrecio: number;
  cursosTotal: number;
  profesoresSinCorreo: number;
  profesoresTotal: number;
  inscripcionesSinMonto: number;
}> {
  const db = getDb();

  const [cursos] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sinPrecio: sql<number>`count(*) filter (where ${schema.course.listPrice} is null or ${schema.course.listPrice} = 0)::int`,
    })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId));

  const [profes] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sinCorreo: sql<number>`count(*) filter (where ${schema.teacher.email} is null or ${schema.teacher.email} = '')::int`,
    })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId));

  const [insc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          sql`${schema.enrollment.cohortId} is not null`,
          or(isNull(schema.enrollment.amount), eq(schema.enrollment.amount, 0))
        )
      )
    );

  return {
    cursosTotal: cursos?.total ?? 0,
    cursosSinPrecio: cursos?.sinPrecio ?? 0,
    profesoresTotal: profes?.total ?? 0,
    profesoresSinCorreo: profes?.sinCorreo ?? 0,
    inscripcionesSinMonto: insc?.n ?? 0,
  };
}
