import { z } from "zod";
import { PAYMENT_TERMS, type PaymentTerms } from "./company-terms";

/**
 * 040 — Los datos de una empresa, tal como Administración los necesita para
 * facturar. Reglas PURAS: qué se acepta, cómo se normaliza y qué se rechaza.
 * La lectura y la escritura viven en `src/server/companies.ts`.
 */

export { PAYMENT_TERMS, type PaymentTerms };

export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  contado: "Contado",
  credito: "Crédito",
};

/** Lo que se guarda de una empresa (todo menos la razón social puede faltar). */
export type CompanyFields = {
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  /** El departamento, en Uruguay. */
  addressState: string | null;
  addressCountry: string | null;
  billingContactName: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentTerms: PaymentTerms | null;
  /** Solo con `credito`; con contado (o sin condición) siempre NULL. */
  paymentTermDays: number | null;
  notes: string | null;
};

const texto = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * Los campos opcionales, compartidos por el alta y la edición. Un texto vacío
 * es válido (se guarda NULL): borrar un dato es mandarlo vacío.
 */
const camposOpcionales = {
  tradeName: texto(200),
  taxId: texto(60),
  addressStreet: texto(200),
  addressCity: texto(120),
  addressState: texto(120),
  addressCountry: texto(80),
  billingContactName: texto(160),
  billingEmail: z
    .union([z.literal(""), z.string().trim().email("El correo de facturación no tiene un formato válido").max(200)])
    .nullable()
    .optional(),
  billingPhone: texto(60),
  paymentTerms: z.enum(PAYMENT_TERMS).nullable().optional(),
  paymentTermDays: z
    .number()
    .int()
    .min(1, "El plazo es de al menos 1 día")
    .max(365, "El plazo es de hasta 365 días")
    .nullable()
    .optional(),
  notes: texto(2000),
};

export const companyCreateSchema = z.object({
  legalName: z.string().trim().min(1, "La razón social es obligatoria").max(200),
  ...camposOpcionales,
});

export const companyPatchSchema = z.object({
  legalName: z.string().trim().min(1, "La razón social es obligatoria").max(200).optional(),
  ...camposOpcionales,
});

export type CompanyInput = z.input<typeof companyPatchSchema>;

/** Sin tildes, en minúsculas y con los espacios colapsados. */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NOMBRES_DE_URUGUAY = new Set(["uruguay", "uy", "rou", "republica oriental del uruguay"]);

/** DV-004 — El país decide cómo se valida el RUT. País vacío: no se valida. */
export function esUruguay(country: string | null | undefined): boolean {
  return country ? NOMBRES_DE_URUGUAY.has(plano(country)) : false;
}

/**
 * DV-005 — Para COMPARAR dos RUT, no para guardarlos: solo letras y dígitos,
 * en mayúsculas. "21.234.567-0018" y "212345670018" son el mismo.
 */
export function normalizarRut(taxId: string): string {
  return taxId.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** ¿El RUT cambió de verdad? Vacío y NULL son lo mismo. */
export function cambiaElRut(antes: string | null, despues: string | null): boolean {
  return normalizarRut(antes ?? "") !== normalizarRut(despues ?? "");
}

/** Uruguay: 12 dígitos, admitiendo puntos, guiones y espacios al escribirlo. */
function rutUruguayoValido(taxId: string): boolean {
  return /^[\d.\-\s]+$/.test(taxId) && taxId.replace(/\D/g, "").length === 12;
}

const limpio = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
};

export type ResolverEmpresaResult =
  | { ok: true; data: CompanyFields }
  | { ok: false; status: 422; code: string; message: string };

/**
 * Lo que queda guardado después de aplicar `cambios` sobre `actual` (`null` =
 * alta). Lo que no viene se conserva; `null` o vacío borra.
 *
 * - La razón social no puede quedar vacía.
 * - El RUT se valida contra el país que QUEDA, y solo si el RUT cambia: un
 *   RUT histórico mal cargado no impide corregir una dirección.
 * - Contado (o sin condición) no lleva días de plazo.
 */
export function resolverEmpresa(
  actual: CompanyFields | null,
  cambios: CompanyInput
): ResolverEmpresaResult {
  const tomar = <K extends keyof CompanyFields>(k: K): CompanyFields[K] | null | undefined =>
    k in cambios && (cambios as Record<string, unknown>)[k] !== undefined
      ? ((cambios as Record<string, unknown>)[k] as CompanyFields[K] | null)
      : actual
        ? actual[k]
        : null;

  const legalName = limpio(tomar("legalName") as string | null);
  if (!legalName) {
    return {
      ok: false,
      status: 422,
      code: "razon_social_obligatoria",
      message: "La razón social es obligatoria",
    };
  }

  const taxId = limpio(tomar("taxId") as string | null);
  const addressCountry = limpio(tomar("addressCountry") as string | null);
  const rutCambio = actual === null || cambiaElRut(actual.taxId, taxId);
  const paisCambio = actual !== null && limpio(actual.addressCountry) !== addressCountry;
  if (taxId && (rutCambio || paisCambio) && esUruguay(addressCountry) && !rutUruguayoValido(taxId)) {
    return {
      ok: false,
      status: 422,
      code: "rut_invalido",
      message: "El RUT uruguayo tiene 12 dígitos (podés escribirlo con puntos o guiones).",
    };
  }

  const paymentTerms = (tomar("paymentTerms") as PaymentTerms | null) ?? null;
  const dias = (tomar("paymentTermDays") as number | null) ?? null;

  return {
    ok: true,
    data: {
      legalName,
      tradeName: limpio(tomar("tradeName") as string | null),
      taxId,
      addressStreet: limpio(tomar("addressStreet") as string | null),
      addressCity: limpio(tomar("addressCity") as string | null),
      addressState: limpio(tomar("addressState") as string | null),
      addressCountry,
      billingContactName: limpio(tomar("billingContactName") as string | null),
      billingEmail: limpio(tomar("billingEmail") as string | null),
      billingPhone: limpio(tomar("billingPhone") as string | null),
      paymentTerms,
      paymentTermDays: paymentTerms === "credito" ? dias : null,
      notes: limpio(tomar("notes") as string | null),
    },
  };
}

/** "Crédito a 30 días", "Contado", o `null` si no se sabe. */
export function condicionDePago(
  terms: PaymentTerms | null,
  days: number | null
): string | null {
  if (terms === "contado") return "Contado";
  if (terms === "credito") return days ? `Crédito a ${days} días` : "Crédito";
  return null;
}
