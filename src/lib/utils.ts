import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales (máx 2) para el avatar de un contacto. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

/* Paleta desaturada del handoff (AV): sobria sobre fondo claro. */
const AVATAR_COLORS = [
  "bg-[#5b7291]", // steel
  "bg-[#647082]", // slate
  "bg-[#6f8378]", // sage
  "bg-[#8c7d68]", // taupe
  "bg-[#9c7169]", // clay
  "bg-[#77708c]", // dusk
  "bg-[#4f7d78]", // tealm
  "bg-[#6b7280]", // graphite
] as const;

/** Color estable por contacto: hash simple del id/teléfono → misma clase siempre. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function formatPhone(phone: string | null | undefined): string {
  // 003: contactos BSUID pueden no tener teléfono.
  return phone ? `+${phone}` : "Sin teléfono";
}

/**
 * 005 iteración 6 (feedback en vivo: "quiero que contacto tenga nombre y
 * apellido por separado") — nombre completo para mostrar; `lastName` puede
 * ser null (contactos de WhatsApp/formulario público solo traen un string).
 */
export function fullName(c: { firstName: string; lastName?: string | null }): string {
  return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
}

/**
 * 006 — Normaliza un texto a slug de URL. Tiene que dar EXACTAMENTE lo mismo
 * que el backfill SQL de `drizzle/0014_bored_ricochet.sql` (acentos planchados,
 * todo lo no alfanumérico a guiones, fallback `curso`): si divergen, un curso
 * migrado y uno creado desde la app terminan con slugs distintos para el mismo
 * nombre.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    // Marcas diacríticas combinantes que deja NFD (tildes, diéresis, la ~ de ñ).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "curso";
}

/**
 * 007 — Símbolo por moneda (los alumnos de Paraguay pagan en guaraníes). Vive
 * acá por el mismo motivo que `WEEKDAY_LABELS`: el roster, el panel de
 * facturación y el formulario de inscripción muestran los mismos importes, y
 * con una copia por pantalla la que se olvide de una moneda nueva la imprime
 * con el símbolo de otra.
 */
const CURRENCY_SYMBOL: Record<string, string> = {
  UYU: "$",
  PYG: "Gs. ",
  USD: "US$",
};

/** Importe con el símbolo de SU moneda; nunca asume pesos. */
export function formatAmount(
  amount: number | null | undefined,
  currency: string | undefined
): string {
  if (amount === null || amount === undefined) return "—";
  return `${CURRENCY_SYMBOL[currency ?? "UYU"] ?? "$"}${amount.toLocaleString("es-UY")}`;
}

/**
 * Días de la semana en el ORDEN que define el contrato de
 * `cohort.days_of_week`: el índice de este array ES el número que se persiste
 * en ese CSV (0=lunes … 6=domingo). Vive acá y no en cada pantalla porque el
 * selector de la cohorte, el resumen del listado y el calendario tienen que
 * mapear el mismo índice — con tres copias, una termina desfasada y la cohorte
 * se dibuja el día equivocado.
 */
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/**
 * Escapa texto para interpolarlo en HTML.
 *
 * Vive acá, en UN solo lugar, por el mismo motivo que `contrastRatio()`: había
 * TRES copias —dos rutas de impresión y el módulo de correo— y ya se habían
 * separado. Las de impresión no escapaban el apóstrofo; la del correo sí. Dos
 * implementaciones de lo mismo se separan siempre, y cuando se separan la que
 * quedó atrás no avisa.
 *
 * Lo que entra acá es el nombre de un contacto, y **un contacto puede haber
 * llegado por un formulario público sin autenticar**. `csvField()` ya trata
 * ese vector con respeto en la exportación; el HTML merece lo mismo.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
