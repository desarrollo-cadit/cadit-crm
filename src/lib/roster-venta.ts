import type { RosterEntryDto } from "@/server/enrollments";

/**
 * 2026-10-23 — Qué VENTA muestra y edita cada fila del roster.
 *
 * La hija de un módulo no es una venta: la venta (monto, cuotas, vendedor,
 * empresa, factura…) es la madre, la inscripción a la especialización. Si la
 * fila trae `parentSale` (solo viaja con `cobranza.ver`), las columnas de
 * Monto y Vendedor, la sección financiera y el diálogo de edición usan la de
 * la madre y editan la madre. Sin `parentSale`, la fila es su propia venta.
 *
 * Puro: la pantalla decide qué dibuja, no qué datos hay.
 */
export type VentaDeFila = {
  /** La inscripción que se edita (`PATCH /api/enrollments/[id]`). */
  enrollmentId: string;
  /** Verdadero si lo que se ve y se edita es la venta de la especialización. */
  deLaEspecializacion: boolean;
  /** La fila, con los datos comerciales de la venta que corresponde. */
  entry: RosterEntryDto;
};

export function ventaDeLaFila(e: RosterEntryDto): VentaDeFila {
  const madre = e.parentSale;
  if (!madre) return { enrollmentId: e.id, deLaEspecializacion: false, entry: e };
  return {
    enrollmentId: madre.enrollmentId,
    deLaEspecializacion: true,
    entry: {
      ...e,
      amount: madre.amount,
      currency: madre.currency,
      installments: madre.installments,
      paymentNotes: madre.paymentNotes,
      nationalId: madre.nationalId,
      invoiceNumber: madre.invoiceNumber,
      receiptNumber: madre.receiptNumber,
      sellerId: madre.sellerId,
      seller: madre.seller,
      sellerRequired: madre.sellerRequired,
      companyId: madre.companyId,
    },
  };
}
