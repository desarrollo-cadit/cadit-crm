import { z } from "zod";
import { isArea, type AreaConfigDto, type ConfigArea } from "@/lib/areas";

/**
 * Configuración › Áreas — el formulario de UN área, sin React ni servidor.
 *
 * Traduce entre lo que devuelve `GET /api/settings/areas` (`AreaConfigDto`) y
 * lo que acepta `PUT /api/settings/areas/[area]` (`areaConfigBodySchema` de
 * `src/server/areas/config.ts`). Los límites y el validador de correo son los
 * MISMOS que los del servidor: la pantalla avisa antes, pero quien decide es
 * la API.
 */

/** Límites del contrato (`contracts/api-areas.md`). */
export const AREA_LIMITS = {
  mailbox: 200,
  ccEmails: 10,
  ccSellerIds: 20,
  contactText: 600,
} as const;

/** Lo que llega a cada área, en una línea. Lo lee quien configura. */
export const AREA_HELP: Record<ConfigArea, string> = {
  ventas:
    "Recibe las consultas comerciales que el asistente de WhatsApp le deriva (interesados, precios, inscripciones).",
  soporte:
    "Recibe las consultas de soporte que el asistente de WhatsApp le deriva y el aviso de cada cohorte confirmada.",
  administracion:
    "Solo avisos internos: cada inscripción nueva para facturar (con copia al vendedor de la venta), cada pago registrado, la morosidad de la semana los lunes y la facturación pendiente de cada cohorte confirmada, 7 y 2 días antes del inicio.",
  interesados:
    "Solo avisos internos: cada persona que deja sus datos en un formulario de la web (la página de un curso, un formulario de campaña o la inscripción a un taller), con sus datos, qué le interesa y el enlace al contacto. Podés sumar vendedores en copia.",
};

/**
 * ¿El área atiende clientes? Ventas y Soporte sí (el agente les deriva y le
 * contesta al cliente con su texto y su horario); Administración no.
 */
export function atiendeClientes(area: ConfigArea): boolean {
  return isArea(area);
}

/** Ventas y Nuevos interesados llevan vendedores en copia (`checkCcSellers`). */
export function llevaVendedores(area: ConfigArea): boolean {
  return area === "ventas" || area === "interesados";
}

export type AreaForm = {
  enabled: boolean;
  mailbox: string;
  /** Texto libre: correos separados por coma, punto y coma, espacio o renglón. */
  ccEmails: string;
  ccSellerIds: string[];
  contactText: string;
  hoursEnabled: boolean;
  days: number[];
  from: string;
  to: string;
};

export type AreaBody = {
  enabled: boolean;
  mailbox: string | null;
  ccEmails: string[];
  ccSellerIds: string[];
  contactText: string | null;
  officeHours: { days: number[]; from: string; to: string } | null;
};

export type AreaFormErrors = Partial<
  Record<"mailbox" | "ccEmails" | "ccSellerIds" | "contactText" | "officeHours", string>
>;

/** Lunes a viernes, 9 a 18: lo que se propone al encender el horario. */
const HORARIO_SUGERIDO = { days: [0, 1, 2, 3, 4], from: "09:00", to: "18:00" };

export function formFromDto(dto: AreaConfigDto<ConfigArea>): AreaForm {
  return {
    enabled: dto.enabled,
    mailbox: dto.mailbox ?? "",
    ccEmails: dto.ccEmails.join(", "),
    ccSellerIds: [...dto.ccSellerIds],
    contactText: dto.contactText ?? "",
    hoursEnabled: dto.officeHours !== null,
    days: dto.officeHours ? [...dto.officeHours.days] : [...HORARIO_SUGERIDO.days],
    from: dto.officeHours?.from ?? HORARIO_SUGERIDO.from,
    to: dto.officeHours?.to ?? HORARIO_SUGERIDO.to,
  };
}

/** Parte el texto de copias en correos, sin vacíos ni repetidos (sin distinguir mayúsculas). */
export function splitEmails(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

const emailSchema = z.string().email();

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

/**
 * Valida el formulario y arma el cuerpo del `PUT`.
 *
 * Para un área que no atiende clientes, el texto de contacto y el horario no
 * se muestran y se mandan como `null`: no tienen a quién decírselos.
 * `activeSellerIds` son los vendedores que la pantalla puede ofrecer; uno
 * elegido que ya no está (archivado o borrado) haría fallar el guardado con
 * un 422, así que se avisa antes.
 */
export function buildAreaBody(
  area: ConfigArea,
  form: AreaForm,
  activeSellerIds: readonly string[]
): { ok: true; body: AreaBody } | { ok: false; errors: AreaFormErrors } {
  const errors: AreaFormErrors = {};

  const mailbox = form.mailbox.trim();
  if (mailbox) {
    if (!isValidEmail(mailbox)) errors.mailbox = `«${mailbox}» no es un correo válido.`;
    else if (mailbox.length > AREA_LIMITS.mailbox) errors.mailbox = "El correo es demasiado largo.";
  } else if (form.enabled) {
    errors.mailbox = "Para encender el área hace falta la casilla.";
  }

  const ccEmails = splitEmails(form.ccEmails);
  const invalidos = ccEmails.filter((e) => !isValidEmail(e) || e.length > AREA_LIMITS.mailbox);
  if (invalidos.length > 0) {
    errors.ccEmails =
      invalidos.length === 1
        ? `«${invalidos[0]}» no es un correo válido.`
        : `Estos correos no son válidos: ${invalidos.join(", ")}.`;
  } else if (ccEmails.length > AREA_LIMITS.ccEmails) {
    errors.ccEmails = `Como máximo ${AREA_LIMITS.ccEmails} correos en copia.`;
  }

  const ccSellerIds = llevaVendedores(area) ? [...new Set(form.ccSellerIds)] : [];
  if (ccSellerIds.some((id) => !activeSellerIds.includes(id))) {
    errors.ccSellerIds = "Hay vendedores elegidos que ya no están activos: quitalos para guardar.";
  } else if (ccSellerIds.length > AREA_LIMITS.ccSellerIds) {
    errors.ccSellerIds = `Como máximo ${AREA_LIMITS.ccSellerIds} vendedores en copia.`;
  }

  const clientes = atiendeClientes(area);
  const contactText = clientes ? form.contactText.trim() : "";
  if (contactText.length > AREA_LIMITS.contactText) {
    errors.contactText = `El texto puede tener hasta ${AREA_LIMITS.contactText} caracteres.`;
  }

  let officeHours: AreaBody["officeHours"] = null;
  if (clientes && form.hoursEnabled) {
    const hora = /^\d{2}:\d{2}$/;
    if (form.days.length === 0) errors.officeHours = "Elegí al menos un día.";
    else if (!hora.test(form.from) || !hora.test(form.to)) errors.officeHours = "Completá las dos horas.";
    else if (form.from >= form.to) errors.officeHours = "El horario tiene que empezar antes de terminar.";
    else officeHours = { days: [...new Set(form.days)].sort((a, b) => a - b), from: form.from, to: form.to };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      enabled: form.enabled,
      mailbox: mailbox || null,
      ccEmails,
      ccSellerIds,
      contactText: contactText || null,
      officeHours,
    },
  };
}
