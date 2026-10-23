import type { SendMailResult } from "@/lib/m365/client";

/**
 * 045 (data-model §3–§4; DV-002; FR-017, FR-019, FR-020) — Qué transiciones
 * existen y qué hacer con cada respuesta de Graph. Puro.
 */

export type EstadoDeCampana = "borrador" | "enviando" | "enviada" | "cancelada";
export type EstadoDeDestinatario = "pendiente" | "enviando" | "enviado" | "fallido" | "omitido" | "cancelado";

const CAMPANA: Record<EstadoDeCampana, readonly EstadoDeCampana[]> = {
  borrador: ["enviando"],
  enviando: ["enviada", "cancelada"],
  // No hay vuelta atrás (FR-019).
  enviada: [],
  cancelada: [],
};

const DESTINATARIO: Record<EstadoDeDestinatario, readonly EstadoDeDestinatario[]> = {
  pendiente: ["enviando", "omitido", "cancelado"],
  // `pendiente` otra vez solo cuando Graph NO aceptó (límite o buzón sin permiso).
  enviando: ["enviado", "fallido", "pendiente"],
  enviado: [],
  fallido: [],
  omitido: [],
  cancelado: [],
};

export function puedeTransicionarCampana(de: EstadoDeCampana, a: EstadoDeCampana): boolean {
  return CAMPANA[de].includes(a);
}

export function puedeTransicionarDestinatario(de: EstadoDeDestinatario, a: EstadoDeDestinatario): boolean {
  return DESTINATARIO[de].includes(a);
}

export type ResultadoClasificado =
  | { estado: "enviado" }
  /** Graph no lo aceptó por el límite: vuelve a la cola tras la pausa. */
  | { estado: "pendiente"; pausaMs: number }
  /** El buzón perdió el permiso: se detiene la campaña hasta que se arregle. */
  | { estado: "pendiente"; detener: true; motivo: string }
  | { estado: "fallido"; motivo: string };

export function clasificarResultado(r: SendMailResult): ResultadoClasificado {
  if (r.ok) return { estado: "enviado" };
  switch (r.code) {
    case "throttled":
      return { estado: "pendiente", pausaMs: r.retryAfterMs };
    case "mailbox_denied":
      return { estado: "pendiente", detener: true, motivo: r.message };
    default:
      return { estado: "fallido", motivo: r.message };
  }
}
