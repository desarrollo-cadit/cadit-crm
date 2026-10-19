import { CURRENCIES, type Currency } from "@/lib/db/schema";
import type { CourseKind } from "@/lib/course-kind";
import { esVentaParaAviso } from "@/lib/billing-notices";
import { csvField } from "@/lib/csv";
import { estaFacturada, normalizarNumero, pendienteDeFacturar } from "@/lib/facturacion-regla";

/**
 * 042 — Facturación: las reglas puras.
 *
 * Administración recibe desde 039 la lista de quienes no tienen factura 7 y 2
 * días antes del inicio, y desde 041 cada venta nueva. Lo que no podía era
 * ANOTAR el número: eso colgaba de `inscripciones.editar`, que también cambia
 * montos. Esta fase le da `facturacion.editar` (solo documentos) y una
 * pantalla con lo que falta facturar.
 *
 * La regla central de este archivo es `pendienteDeFacturar`, y la usan los
 * DOS lados: el correo de T-7/T-2 (`sinFacturar` en `staff-notices.ts`) y la
 * pestaña Pendientes de la pantalla (`enLaVista`). Si cada lado tuviera la
 * suya, el correo diría "faltan 3" y la pantalla mostraría 2, y nadie sabría
 * cuál creer. `tests/unit/facturacion.test.ts` lo fija.
 */

/** Largo máximo del número (igual que la ruta comercial). */
export const MAX_NUMERO = 120;

export { estaFacturada, normalizarNumero, pendienteDeFacturar };

export type EstadoFacturacion = "pendientes" | "facturadas";

/**
 * ¿Esta inscripción va en la pantalla, en esta pestaña?
 *
 * Primero, que sea una VENTA (`esVentaParaAviso`, la misma regla que 041 y
 * que `exigeVendedor`): madre con cohorte y no de un taller. Un lead no se
 * factura todavía, una hija tiene la plata en su madre y un taller tiene su
 * propio circuito (033). Después, la pestaña:
 *
 * - Pendientes = `pendienteDeFacturar`, la regla del correo.
 * - Facturadas = las mismas ventas activas, con número: están para corregir.
 */
export function enLaVista(
  f: {
    cohortId: string | null;
    parentEnrollmentId: string | null;
    courseKind: CourseKind | null;
    deBaja: boolean;
    invoiceNumber: string | null;
  },
  estado: EstadoFacturacion
): boolean {
  if (!esVentaParaAviso(f)) return false;
  const pendiente = pendienteDeFacturar({
    deBaja: f.deBaja,
    esHija: f.parentEnrollmentId !== null,
    invoiceNumber: f.invoiceNumber,
  });
  if (estado === "pendientes") return pendiente;
  return !f.deBaja && estaFacturada(f.invoiceNumber);
}

/* ============================================================
 * La fila de la pantalla
 * ============================================================ */

export type EmpresaParaFacturar = {
  razonSocial: string;
  rut: string | null;
  billingEmail: string | null;
  /** "Contado", "Crédito a 30 días"… ya en castellano (`condicionDePago`). */
  condicion: string | null;
};

export type FilaFacturacion = {
  enrollmentId: string;
  contactId: string;
  alumno: string;
  curso: string;
  cohorte: string | null;
  cohortId: string;
  /** Día de inicio `AAAA-MM-DD` (`cohort.start_date` se guarda a medianoche UTC). */
  inicio: string;
  /** 039 — la cohorte está confirmada ("sale"). */
  confirmada: boolean;
  vendedor: string | null;
  amount: number | null;
  currency: Currency;
  invoiceNumber: string | null;
  /** 042 — cuándo se anotó (o corrigió) el número, ISO. */
  invoiceRecordedAt: string | null;
  empresa: EmpresaParaFacturar | null;
};

export type FiltrosFacturacion = {
  cohortId: string | null;
  /** Inicio desde / hasta, `AAAA-MM-DD`, inclusive. */
  desde: string | null;
  hasta: string | null;
  soloConfirmadas: boolean;
  empresa: "todas" | "con" | "sin";
};

/**
 * Filtra y ORDENA (inicio, alumno, id): una pantalla que se transcribe tiene
 * que devolver siempre las filas en el mismo orden, para reencontrar la fila
 * donde se dejó (026).
 */
export function filtrarFacturacion(
  filas: readonly FilaFacturacion[],
  f: FiltrosFacturacion
): FilaFacturacion[] {
  return filas
    .filter((r) => !f.cohortId || r.cohortId === f.cohortId)
    .filter((r) => !f.desde || r.inicio >= f.desde)
    .filter((r) => !f.hasta || r.inicio <= f.hasta)
    .filter((r) => !f.soloConfirmadas || r.confirmada)
    .filter((r) => f.empresa === "todas" || (f.empresa === "con") === (r.empresa !== null))
    .sort(
      (a, b) =>
        a.inicio.localeCompare(b.inicio) ||
        a.alumno.localeCompare(b.alumno, "es") ||
        a.enrollmentId.localeCompare(b.enrollmentId)
    );
}

/**
 * Un total por moneda, en el orden de `CURRENCIES`. **No existe un total
 * general**: sumar pesos con guaraníes no es un número (026). Las ventas sin
 * monto pactado se cuentan aparte: no son cero.
 */
export function totalesPorMoneda(filas: readonly FilaFacturacion[]): {
  totales: { currency: Currency; total: number; cantidad: number }[];
  sinMonto: number;
} {
  const totales = CURRENCIES.map((currency) => {
    const suyas = filas.filter((r) => r.currency === currency && r.amount !== null);
    return {
      currency,
      total: suyas.reduce((s, r) => s + (r.amount ?? 0), 0),
      cantidad: suyas.length,
    };
  }).filter((t) => t.cantidad > 0);
  return { totales, sinMonto: filas.filter((r) => r.amount === null).length };
}

/** 040 — La condición de pago de la empresa, en castellano. */
export function condicionDePago(
  terms: string | null,
  days: number | null
): string | null {
  if (terms === "contado") return "Contado";
  if (terms === "credito") return days ? `Crédito a ${days} días` : "Crédito";
  return null;
}

/**
 * ¿El mismo número ya está en otra venta? **Avisa, no bloquea.**
 *
 * Una factura de empresa puede cubrir a varios empleados, y una persona puede
 * pagar dos cursadas con una sola factura: en esos dos casos el número
 * repetido es correcto y no se dice nada. Lo sospechoso es el mismo número en
 * personas distintas que no comparten empresa: casi siempre es un error de
 * tipeo. Bloquearlo dejaría sin salida el caso legítimo que el sistema no
 * sabe distinguir; avisarlo deja la decisión en quien tiene la factura en la
 * mano.
 */
export function avisoDeFacturaRepetida(
  propia: { contactId: string; companyId: string | null },
  otras: readonly { contactId: string; companyId: string | null; alumno: string }[]
): string | null {
  const sospechosas = otras.filter(
    (o) =>
      o.contactId !== propia.contactId &&
      !(propia.companyId !== null && o.companyId === propia.companyId)
  );
  if (sospechosas.length === 0) return null;
  const nombres = [...new Set(sospechosas.map((o) => o.alumno))];
  const lista = nombres.slice(0, 3).join(", ") + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : "");
  return `Ese número de factura ya está en la venta de ${lista}. Se guardó igual: revisá que no sea un error de tipeo.`;
}

/* ============================================================
 * CSV
 * ============================================================ */

const ENCABEZADO = [
  "Alumno",
  "Curso",
  "Cohorte",
  "Inicio",
  "Confirmada",
  "Vendedor",
  "Monto",
  "Moneda",
  "Factura",
  "Razón social",
  "RUT",
  "Correo de facturación",
  "Condición de pago",
];

/**
 * El CSV de la lista FILTRADA, tal como se ve. Monto y moneda en columnas
 * separadas y sin fila de totales: un total mezclaría monedas.
 *
 * Se arma en el navegador con los datos que ya viajaron con `cobranza.ver`:
 * no hay una ruta `text/csv` nueva que pueda traer más que la pantalla.
 */
export function facturacionCsv(filas: readonly FilaFacturacion[]): string {
  const lineas = filas.map((r) =>
    [
      r.alumno,
      r.curso,
      r.cohorte,
      r.inicio,
      r.confirmada ? "Sí" : "No",
      r.vendedor,
      r.amount === null ? null : String(r.amount),
      r.currency,
      r.invoiceNumber,
      r.empresa?.razonSocial ?? null,
      r.empresa?.rut ?? null,
      r.empresa?.billingEmail ?? null,
      r.empresa?.condicion ?? null,
    ]
      .map(csvField)
      .join(",")
  );
  return [ENCABEZADO.join(","), ...lineas].join("\r\n");
}
