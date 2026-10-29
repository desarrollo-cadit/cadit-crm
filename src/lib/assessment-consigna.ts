import { z } from "zod";
import { normalizarPlantilla, type Criterion, type Scale, type Template } from "@/lib/grading-template";
import { httpUrl } from "@/lib/url-schema";

/**
 * 0084 — La CONSIGNA de una evaluación: qué hay que hacer (texto en la
 * gramática en línea de `src/lib/markdown-inline.ts`, que se dibuja con
 * `<Markdown>`; nunca HTML) y los enlaces adjuntos (planos base, guía…).
 *
 * Pura: la usan el editor del grupo (`guardarConsigna`) y el del modelo del
 * curso, y las dos tienen que validar igual. No se congela: aclarar una
 * consigna no le mueve la nota a nadie (la rúbrica sí se congela).
 */

export const CONSIGNA_MAX = 20_000;
export const ADJUNTOS_MAX = 20;
const TITULO_MAX = 200;

export type AdjuntoInput = { title: string; url: string };
export type ConsignaInput = { instructionsMd: string; adjuntos: AdjuntoInput[] };

/** La FORMA (para `parseBody`); los topes y mensajes los dice `validarConsigna`. */
export const consignaSchema = z.object({
  instructionsMd: z.string().max(CONSIGNA_MAX * 2),
  adjuntos: z
    .array(z.object({ title: z.string().max(TITULO_MAX * 2), url: z.string().max(4000) }))
    .max(ADJUNTOS_MAX * 2),
});

export type ConsignaValida =
  | { ok: true; data: ConsignaInput }
  | { ok: false; code: "consigna_invalida" | "adjunto_invalido"; mensaje: string };

export function validarConsigna(entrada: ConsignaInput): ConsignaValida {
  const instructionsMd = entrada.instructionsMd.trim();
  if (instructionsMd.length > CONSIGNA_MAX) {
    return {
      ok: false,
      code: "consigna_invalida",
      mensaje: `La consigna es demasiado larga (máximo ${CONSIGNA_MAX.toLocaleString("es-UY")} caracteres).`,
    };
  }
  if (entrada.adjuntos.length > ADJUNTOS_MAX) {
    return {
      ok: false,
      code: "adjunto_invalido",
      mensaje: `Una consigna lleva hasta ${ADJUNTOS_MAX} adjuntos.`,
    };
  }
  const adjuntos: AdjuntoInput[] = [];
  for (const a of entrada.adjuntos) {
    const title = a.title.trim();
    if (!title || title.length > TITULO_MAX) {
      return { ok: false, code: "adjunto_invalido", mensaje: "Cada adjunto necesita un título (hasta 200 caracteres)." };
    }
    const url = httpUrl.safeParse(a.url);
    if (!url.success) {
      return {
        ok: false,
        code: "adjunto_invalido",
        mensaje: `«${title}»: el enlace tiene que empezar con http:// o https://`,
      };
    }
    adjuntos.push({ title, url: url.data });
  }
  return { ok: true, data: { instructionsMd, adjuntos } };
}

/**
 * 0084 — Lo que el ALUMNO ve de la rúbrica antes de entregar: escala, mínimo
 * y cada criterio con su puntaje y las frases de cada nivel. NO viaja el
 * circuito de aprobación (`requiresApproval`) ni los campos de texto del
 * corrector: un dato que no se debe ver no viaja.
 */
export type RubricaDelAlumno = { scale: Scale; minScore: number | null; criteria: Criterion[] };

export function rubricaParaElAlumno(t: Template): RubricaDelAlumno {
  const limpia = normalizarPlantilla(t);
  return { scale: limpia.scale, minScore: limpia.minScore, criteria: limpia.criteria };
}
