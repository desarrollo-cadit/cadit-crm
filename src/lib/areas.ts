/**
 * 029 — Agente por áreas: vocabulario compartido entre el servidor y la UI.
 *
 * Sin imports de servidor a propósito: lo leen la pantalla de Configuración ›
 * Áreas y el panel del inbox, que corren en el navegador.
 *
 * - **Área** = a dónde se DERIVA por correo: las áreas del negocio que no
 *   operan el CRM. Lista cerrada de dos.
 * - **Tema** = de qué habla el cliente en este turno. Suma `academia` (lo
 *   atiende el propio agente) y `sin_determinar` (hay que aclarar).
 */

export const AREAS = ["ventas", "soporte"] as const;
export type Area = (typeof AREAS)[number];

export const TOPICS = ["ventas", "soporte", "academia", "sin_determinar"] as const;
export type Topic = (typeof TOPICS)[number];

export const AREA_LABELS: Record<Area, string> = {
  ventas: "Ventas",
  soporte: "Soporte",
};

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

/**
 * 039 — Las áreas que se CONFIGURAN (casilla + copias): las de derivación más
 * `administracion`, que existe solo para los avisos internos (facturación
 * pendiente antes del inicio de una cohorte).
 *
 * Es otra lista y no una entrada más en `AREAS` a propósito: `AREAS` es lo que
 * el agente puede elegir en `derive_area` (`src/server/ai/actions.ts`) y lo que
 * ve el prompt. Administración no atiende clientes por WhatsApp.
 *
 * `interesados` (Nuevos interesados) tampoco: recibe el aviso de cada persona
 * que deja sus datos en un formulario público (`src/lib/lead-notices.ts`). Va
 * aparte de Ventas porque a quién se avisa puede variar.
 */
export const CONFIG_AREAS = [...AREAS, "administracion", "interesados"] as const;
export type ConfigArea = (typeof CONFIG_AREAS)[number];

export const CONFIG_AREA_LABELS: Record<ConfigArea, string> = {
  ...AREA_LABELS,
  administracion: "Administración",
  interesados: "Nuevos interesados",
};

export function isConfigArea(value: string): value is ConfigArea {
  return (CONFIG_AREAS as readonly string[]).includes(value);
}

/** Lo que el agente junta del cliente antes de derivar (`contracts/agente.md`). */
export const COLLECTED_FIELDS = [
  "name",
  "company",
  "product",
  "quantity",
  "email",
  "phone",
  "problem",
  "since",
] as const;
export type CollectedField = (typeof COLLECTED_FIELDS)[number];
export type Collected = Partial<Record<CollectedField, string>>;

/** Rótulos humanos: los lee quien recibe el correo, no un programador. */
export const COLLECTED_FIELD_LABELS: Record<CollectedField, string> = {
  name: "Nombre",
  company: "Empresa",
  product: "Producto",
  quantity: "Cantidad",
  email: "Correo",
  phone: "Teléfono",
  problem: "Problema",
  since: "Desde cuándo",
};

/** Días con 0 = lunes, como `WEEKDAY_LABELS`; horas "HH:MM" en la zona de la organización. */
export type OfficeHours = { days: number[]; from: string; to: string };

export const HANDOFF_EMAIL_STATUSES = [
  "pendiente",
  "enviado",
  "fallido",
  "sin_configurar",
  "simulado",
] as const;
export type HandoffEmailStatus = (typeof HANDOFF_EMAIL_STATUSES)[number];

export type HandoffEmailKind = "apertura" | "seguimiento";

/**
 * 039 — Genérico en el área: lo que lee el agente es `AreaConfigDto` (solo
 * Ventas y Soporte); la pantalla de configuración ve `AreaConfigDto<ConfigArea>`.
 */
export type AreaConfigDto<A extends ConfigArea = Area> = {
  area: A;
  enabled: boolean;
  mailbox: string | null;
  ccEmails: string[];
  ccSellerIds: string[];
  contactText: string | null;
  officeHours: OfficeHours | null;
  updatedAt: string | null;
};

export type AreaHandoffEmailDto = {
  kind: HandoffEmailKind;
  status: HandoffEmailStatus;
  error: string | null;
  to: string[];
  cc: string[];
  replyTo: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type AreaHandoffDto = {
  id: string;
  caseRef: string;
  area: Area;
  summary: string;
  status: HandoffEmailStatus;
  missing: string[];
  createdAt: string;
  lastActivityAt: string;
  emails: AreaHandoffEmailDto[];
};

/** Destinatarios resueltos al armar el correo (`area_handoff_email.recipients`). */
export type HandoffRecipients = {
  to: string[];
  cc: string[];
  replyTo: string | null;
  omitted: { sellerId: string; reason: "sin_correo" | "archivado" | "inexistente" }[];
};
