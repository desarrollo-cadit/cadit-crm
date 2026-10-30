/**
 * 2026-10-30 — El buscador de la pantalla Empresas, sin pantalla. La MISMA
 * regla de contactos y Académico (`coincideConBusqueda`): cada palabra en
 * algún campo, sin tildes ni mayúsculas.
 *
 * El RUT se busca como se escribió ("21.234.567-0012") y también por sus
 * dígitos solos ("212345670012"): quien lo copia de una factura no sabe con
 * qué puntuación se cargó.
 */

import { coincideConBusqueda, normalizarBusqueda } from "@/lib/contact-search";

export type EmpresaBuscable = {
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
};

/** Los dígitos del RUT, sin puntos, guiones ni espacios. Sin RUT, `null`. */
export function digitosDeRut(taxId: string | null): string | null {
  const digitos = (taxId ?? "").replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

/** ¿La empresa pasa la búsqueda? Busca en razón social, nombre comercial y RUT. */
export function coincideEmpresa(empresa: EmpresaBuscable, busqueda: string): boolean {
  return coincideConBusqueda(busqueda, {
    texto: [empresa.legalName, empresa.tradeName, empresa.taxId, digitosDeRut(empresa.taxId)],
  });
}

/** Las empresas que pasan la búsqueda, en el orden recibido. */
export function filtrarEmpresas<T extends EmpresaBuscable>(filas: readonly T[], busqueda: string): T[] {
  return filas.filter((f) => coincideEmpresa(f, busqueda));
}

/**
 * Las dos letras del avatar de una empresa: el nombre comercial si lo tiene
 * (es como la conocen), si no la razón social, sin "S.A.", "SRL" ni "Ltda.".
 */
const SOCIETARIAS = new Set([
  "sa",
  "srl",
  "ltda",
  "sas",
  "sociedad",
  "anonima",
  "limitada",
  "de",
  "del",
  "los",
  "las",
  "y",
  "la",
  "el",
]);

function esSocietaria(palabra: string): boolean {
  return SOCIETARIAS.has(normalizarBusqueda(palabra).replace(/\./g, ""));
}

export function inicialesDeEmpresa(empresa: Pick<EmpresaBuscable, "legalName" | "tradeName">): string {
  const nombre = empresa.tradeName?.trim() || empresa.legalName;
  const palabras = nombre
    .split(/[\s—–\-·:/,]+/)
    .filter((p) => p.replace(/\./g, "").length > 0 && !esSocietaria(p));
  const usar = palabras.length > 0 ? palabras : nombre.split(/\s+/).filter(Boolean);
  if (usar.length === 0) return "?";
  if (usar.length === 1) {
    const letras = [...usar[0]!.replace(/[^\p{L}\p{N}]/gu, "")];
    return letras.length > 0 ? letras.slice(0, 2).join("").toUpperCase() : "?";
  }
  return usar
    .slice(0, 2)
    .map((p) => [...p][0]!)
    .join("")
    .toUpperCase();
}
