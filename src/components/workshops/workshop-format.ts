/**
 * 033 — Cómo se muestra un taller en el panel. Sin estado ni efectos.
 */

import type { WorkshopModality, WorkshopRegistrationStatus } from "@/lib/workshop-states";
import { formatAmount } from "@/lib/money";

export type Currency = "UYU" | "PYG" | "USD";

/** Centésimos → "$5.245,32". El formato y los símbolos viven en `src/lib/money.ts`. */
export const money = (n: number, c: Currency) => formatAmount(n, c);

/**
 * El día del taller tal como se cargó. Se guarda a medianoche UTC: leerlo en
 * la zona del navegador lo correría al día anterior.
 */
export function workshopDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `AAAA-MM-DD` para un `<input type="date">`, leído en UTC. */
export function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function horario(start: string | null, end: string | null): string {
  if (!start) return "Sin horario";
  return end ? `${start} a ${end}` : start;
}

export function costLabel(cost: number | null, currency: Currency): string {
  return cost && cost > 0 ? money(cost, currency) : "Gratuito";
}

export function modalityLabel(m: WorkshopModality | null): string {
  if (m === "online") return "Online";
  if (m === "presencial") return "Presencial";
  return "Sin modalidad";
}

export const REGISTRATION_BADGE: Record<
  WorkshopRegistrationStatus,
  "success" | "secondary" | "destructive"
> = {
  abierta: "success",
  cerrada: "secondary",
  cancelada: "destructive",
};
