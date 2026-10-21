/**
 * "$13,680.00" -> 1368000 UYU · "10.000.000" -> 1000000000 PYG · "$0.00" -> 0 UYU.
 *
 * Devuelve CENTÉSIMOS (DV-008 revisada el 2026-10-21, `src/lib/money.ts`):
 * los centésimos de la planilla se conservan, ya no se redondea a entero.
 * El `$` marca pesos uruguayos; un número suelto con miles en punto y del
 * orden del millón es guaraníes (los alumnos de Paraguay).
 *
 * Puro y sin efectos: `cadit-2026.ts` corre al importarse, esto se testea.
 */
export function parseMoney(raw: string): { amount: number; currency: "UYU" | "PYG" } | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const hasDollar = s.includes("$");
  const digits = s.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  // Formato "13,680.00": coma de miles y punto decimal. Formato "10.000.000":
  // punto de miles y sin decimales.
  let normalized: string;
  if (/,\d{3}/.test(digits) || /\.\d{2}$/.test(digits)) {
    normalized = digits.replace(/,/g, "");
  } else {
    normalized = digits.replace(/[.,]/g, "");
  }
  const major = Number(normalized);
  if (!Number.isFinite(major)) return null;
  const currency = !hasDollar && major >= 1_000_000 ? "PYG" : "UYU";
  return { amount: Math.round(major * 100), currency };
}
