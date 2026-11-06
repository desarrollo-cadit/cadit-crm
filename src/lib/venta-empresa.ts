/**
 * 2026-11-06 — VENTA DE EMPRESA (reglas puras).
 *
 * Una empresa que paga un total por varios alumnos del mismo grupo se gestiona
 * UNA vez: una inscripción —la TITULAR— lleva el monto, las cuotas y los pagos
 * de toda la empresa, y las demás quedan CUBIERTAS (`billing_enrollment_id`
 * apunta a la titular). Como todas son del mismo grupo y curso, finanzas,
 * morosidad y los reportes por curso siguen sumando bien: el dinero está en una
 * fila, pero en el curso y la cohorte correctos.
 *
 * Nada acá lee la base: lo usan las rutas de cobranza (para rechazar plata en
 * una cubierta), la inscripción y la pantalla de Facturación.
 */

export const MENSAJE_CUBIERTA =
  "Esta inscripción está cubierta por la venta de su empresa: el total, las cuotas y los pagos se gestionan en la venta de la empresa, no por persona.";

export type MiembroDeVenta = {
  id: string;
  companyId: string | null;
  cohortId: string | null;
  parentEnrollmentId: string | null;
  billingEnrollmentId: string | null;
  /** Orden de alta: la titular por defecto es la más antigua. */
  enrolledAt: Date | null;
  createdAt?: Date | null;
};

/** ¿Esta inscripción NO se cobra por sí misma? */
export function estaCubierta(e: { billingEnrollmentId?: string | null }): boolean {
  return Boolean(e.billingEnrollmentId);
}

const antes = (a: MiembroDeVenta, b: MiembroDeVenta): number =>
  (a.enrolledAt?.getTime() ?? a.createdAt?.getTime() ?? 0) -
    (b.enrolledAt?.getTime() ?? b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id);

/**
 * Los candidatos a titular de una empresa en un grupo: ventas principales (no
 * módulos) de esa empresa y de ese grupo que NO están cubiertas por otra.
 */
export function candidatasATitular(
  miembros: readonly MiembroDeVenta[],
  companyId: string,
  cohortId: string
): MiembroDeVenta[] {
  return miembros
    .filter(
      (m) =>
        m.companyId === companyId &&
        m.cohortId === cohortId &&
        m.parentEnrollmentId === null &&
        m.billingEnrollmentId === null
    )
    .sort(antes);
}

/**
 * La titular a la que se suma un alumno nuevo de la empresa: la que ya lleva
 * una venta de empresa (alguien la tiene como `billing_enrollment_id`) o, si
 * todavía no hay, la más antigua. `null` si no hay ninguna venta de esa empresa
 * en el grupo: el alumno nuevo será la titular.
 */
export function titularAlQueSumar(
  miembros: readonly MiembroDeVenta[],
  companyId: string,
  cohortId: string
): string | null {
  const candidatas = candidatasATitular(miembros, companyId, cohortId);
  if (candidatas.length === 0) return null;
  const conCubiertas = candidatas.find((c) => miembros.some((m) => m.billingEnrollmentId === c.id));
  return (conCubiertas ?? candidatas[0]!).id;
}

export type ProblemaDeVenta = { code: "otra_empresa" | "otro_grupo" | "es_modulo" | "ya_cubierta"; message: string };

/**
 * ¿Puede `miembro` quedar cubierta por `titular`? Misma empresa, mismo grupo,
 * ninguna es un módulo y la titular no puede estar a su vez cubierta (no hay
 * cadenas: una venta tiene UNA titular).
 */
export function problemaParaCubrir(
  miembro: MiembroDeVenta,
  titular: MiembroDeVenta
): ProblemaDeVenta | null {
  if (miembro.id === titular.id) {
    return { code: "ya_cubierta", message: "Una inscripción no puede cubrirse a sí misma." };
  }
  if (miembro.parentEnrollmentId || titular.parentEnrollmentId) {
    return { code: "es_modulo", message: "La venta de empresa es de inscripciones principales, no de módulos." };
  }
  if (!miembro.companyId || miembro.companyId !== titular.companyId) {
    return { code: "otra_empresa", message: "Las dos inscripciones tienen que ser de la misma empresa." };
  }
  if (!miembro.cohortId || miembro.cohortId !== titular.cohortId) {
    return { code: "otro_grupo", message: "Las dos inscripciones tienen que ser del mismo grupo." };
  }
  if (titular.billingEnrollmentId) {
    return { code: "ya_cubierta", message: "La titular elegida está cubierta por otra venta de empresa." };
  }
  return null;
}

/**
 * Cuando la titular sale (baja, borrado), quién la reemplaza: la cubierta más
 * antigua que sigue activa. `null` si no queda nadie (la venta termina con ella).
 */
export function nuevaTitular(
  titularId: string,
  miembros: readonly (MiembroDeVenta & { deBaja?: boolean })[]
): string | null {
  return (
    miembros
      .filter((m) => m.billingEnrollmentId === titularId && !m.deBaja)
      .sort(antes)[0]?.id ?? null
  );
}
