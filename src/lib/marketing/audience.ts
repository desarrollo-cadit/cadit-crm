import { z } from "zod";
import { classInstant } from "@/lib/schedule-time";
import { normalizarCorreo } from "@/lib/contact-identity";

/**
 * 045 (research R4; FR-001, FR-003, FR-004, FR-018) — La parte pura de una
 * audiencia: los filtros, las exclusiones y el tope.
 *
 * La consulta vive en `src/server/marketing/audiences.ts`; acá solo se decide,
 * sin base, quién queda afuera y por qué. Así se prueba sin datos.
 */

/** Tope de destinatarios por campaña (constitución 1.8.0, II.c). */
export const MARKETING_RECIPIENT_CAP = 500;

const lista = z.array(z.string().trim().min(1).max(200)).min(1).max(200);

/** `YYYY-MM-DD` que además existe en el calendario (sin 30 de febrero). */
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que tener la forma AAAA-MM-DD.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Esa fecha no existe.");

/**
 * Los filtros de una audiencia, versionados (`v: 1`) y estrictos: un filtro
 * desconocido es un error, no algo que se ignora en silencio. Sin ningún
 * filtro = toda la base de contactos (el tope de 500 aplica igual).
 */
export const AudienceFiltersSchema = z
  .object({
    v: z.literal(1),
    /** `contact.source` o `contact_form_submission.source`, o "whatsapp". */
    sources: lista.optional(),
    stageIds: lista.optional(),
    cohortIds: lista.optional(),
    courseIds: lista.optional(),
    interestCourseIds: lista.optional(),
    companyIds: lista.optional(),
    createdFrom: fecha.optional(),
    createdTo: fecha.optional(),
    /**
     * 046 (FR-008, FR-009) — Por historial de cursos. Se evalúan con la
     * definición única de `src/lib/recorrido-comercial.ts` (FR-010):
     * `src/lib/marketing/historial-filtros.ts`. Opcionales, así que las
     * audiencias guardadas antes siguen valiendo con `v: 1`.
     */
    historyTakenCourseIds: lista.optional(),
    historyApprovedCourseIds: lista.optional(),
    historyNotApprovedCourseIds: lista.optional(),
    historyNotDoneCourseIds: lista.optional(),
    historyRecent: z
      .object({
        months: z.number().int().min(1).max(120),
        courseIds: lista.optional(),
        categoryIds: lista.optional(),
      })
      .strict()
      .optional(),
    historyNextStepOfCourseId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((f) => !f.createdFrom || !f.createdTo || f.createdFrom <= f.createdTo, {
    message: "La fecha «desde» tiene que ser anterior o igual a la fecha «hasta».",
    path: ["createdTo"],
  });

export type AudienceFilters = z.infer<typeof AudienceFiltersSchema>;

/** Valor sintético del filtro de origen: llegó por WhatsApp. */
export const ORIGEN_WHATSAPP = "whatsapp";

export type ExclusionCounts = {
  prueba: number;
  baja: number;
  archivado: number;
  sin_correo: number;
  duplicado: number;
};

/** Un contacto que cumple los filtros, con lo necesario para decidir. */
export type CandidatoAudiencia = {
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  createdAt: Date;
  /** Tiene alguna conversación `is_test` (Laboratorio). */
  prueba: boolean;
  /** Baja de marketing activa, por contacto o por correo normalizado. */
  baja: boolean;
  archivado: boolean;
};

export type DestinatarioDeAudiencia = {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string | null;
  /** Normalizado. */
  email: string;
};

export type ParticionDeAudiencia = {
  recipients: DestinatarioDeAudiencia[];
  excluded: ExclusionCounts;
  count: number;
  overCap: boolean;
};

const esCorreo = z.string().email();

export function nombreCompleto(firstName: string, lastName: string | null): string {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

/**
 * Una sola exclusión por persona, en este orden: prueba > baja > archivado >
 * sin_correo > duplicado. Ante dos contactos con el mismo correo normalizado
 * gana el más antiguo. Los destinatarios salen ordenados por nombre.
 */
export function particionarAudiencia(candidatos: readonly CandidatoAudiencia[]): ParticionDeAudiencia {
  const excluded: ExclusionCounts = { prueba: 0, baja: 0, archivado: 0, sin_correo: 0, duplicado: 0 };
  const validos: (CandidatoAudiencia & { correo: string })[] = [];

  for (const c of candidatos) {
    if (c.prueba) excluded.prueba++;
    else if (c.baja) excluded.baja++;
    else if (c.archivado) excluded.archivado++;
    else {
      const correo = normalizarCorreo(c.email);
      if (!correo || !esCorreo.safeParse(correo).success) excluded.sin_correo++;
      else validos.push({ ...c, correo });
    }
  }

  // El más antiguo primero; a igual fecha, el id decide (resultado estable).
  validos.sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.contactId.localeCompare(b.contactId)
  );
  const vistos = new Set<string>();
  const recipients: DestinatarioDeAudiencia[] = [];
  for (const c of validos) {
    if (vistos.has(c.correo)) {
      excluded.duplicado++;
      continue;
    }
    vistos.add(c.correo);
    recipients.push({
      contactId: c.contactId,
      name: nombreCompleto(c.firstName, c.lastName),
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.correo,
    });
  }

  recipients.sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
      a.email.localeCompare(b.email)
  );

  return {
    recipients,
    excluded,
    count: recipients.length,
    overCap: recipients.length > MARKETING_RECIPIENT_CAP,
  };
}

function inicioDelDia(dia: string, timeZone: string): Date | null {
  return classInstant(new Date(`${dia}T00:00:00Z`), "00:00", timeZone);
}

function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * El rango de alta en instantes reales: desde el inicio del primer día hasta
 * el inicio del día SIGUIENTE al último (exclusivo), en la zona de la
 * organización. Así el último día entra completo, sin pelear con los
 * milisegundos de las 23:59:59.
 */
export function rangoDeAlta(
  createdFrom: string | undefined,
  createdTo: string | undefined,
  timeZone: string
): { desde: Date | null; hastaExclusivo: Date | null } {
  return {
    desde: createdFrom ? inicioDelDia(createdFrom, timeZone) : null,
    hastaExclusivo: createdTo ? inicioDelDia(diaSiguiente(createdTo), timeZone) : null,
  };
}
