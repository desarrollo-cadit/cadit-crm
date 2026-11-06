import { esDiaValido } from "@/lib/access-expiry";
import { sumarDias } from "@/lib/clonar-grupo";
import { recesoCubreDia, type RangoDeReceso } from "@/lib/recess";

/** La entrega final se propone así de lejos del fin del grupo. */
export const DIAS_DE_ENTREGA_SUGERIDA = 15;

/**
 * El día (AAAA-MM-DD) de la última clase: se cuentan `clases` días de cursada a
 * partir de `inicio`, que cuenta si cae en un día de clase. `diasDeSemana` va
 * desde el LUNES (0=lunes..6=domingo), como `days_of_week`.
 *
 * Los días de `recesos` (rangos y feriados anuales, `recesoCubreDia`) no
 * cuentan como clase, igual que en el cronograma real. Es una sugerencia para
 * el alta y la persona la edita. `null` si falta algún dato —mejor vacío que
 * un fin inventado—.
 */
export function fechaDeFinSugerida(
  inicio: string,
  diasDeSemana: readonly number[],
  clases: number | null,
  recesos: readonly RangoDeReceso[] = []
): string | null {
  if (!esDiaValido(inicio) || !clases || clases < 1) return null;
  const dias = new Set(diasDeSemana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (dias.size === 0) return null;

  let dia = inicio;
  let dictadas = 0;
  // Cota de seguridad: 1 clase por semana y 1000 clases (tope del curso) caben,
  // con margen para recesos largos.
  for (let i = 0; i < 7 * 1000 + 800; i++) {
    const [y, m, d] = dia.split("-").map(Number) as [number, number, number];
    const indice = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    if (dias.has(indice) && !recesos.some((r) => recesoCubreDia(r, dia))) {
      dictadas += 1;
      if (dictadas === clases) return dia;
    }
    dia = sumarDias(dia, 1);
  }
  return null;
}

/** La entrega final sugerida: `DIAS_DE_ENTREGA_SUGERIDA` días después del fin. */
export function entregaFinalSugerida(fin: string): string | null {
  return esDiaValido(fin) ? sumarDias(fin, DIAS_DE_ENTREGA_SUGERIDA) : null;
}
