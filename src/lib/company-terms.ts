/**
 * 040 — Condición de pago de una empresa. Módulo propio y sin dependencias
 * porque `schema.ts` lo importa por VALOR y drizzle-kit lo carga fuera de Next
 * (mismo motivo que `course-kind.ts`).
 */
export const PAYMENT_TERMS = ["contado", "credito"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];
