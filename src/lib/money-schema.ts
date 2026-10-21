import { z } from "zod";
import { MONEY_MAX_MINOR } from "@/lib/money";

/**
 * Montos en los cuerpos JSON de la API interna: CENTÉSIMOS enteros
 * (DV-008 revisada el 2026-10-21). `5245.32` no pasa: el cliente manda
 * `524532`. El tope es el mismo que acepta `MoneyInput`.
 */
export const minorAmount = z.number().int().min(0).max(MONEY_MAX_MINOR);

/** Un pago: al menos un centésimo. */
export const positiveMinorAmount = z.number().int().min(1).max(MONEY_MAX_MINOR);
