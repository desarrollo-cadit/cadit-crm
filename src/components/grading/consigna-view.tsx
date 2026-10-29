import { ExternalLink, FileText } from "lucide-react";
import { Markdown } from "@/components/offline-courses/markdown";
import { ETIQUETA_DE_NIVEL, NIVELES, PORCENTAJE_DE_NIVEL, puntosDeNivel } from "@/lib/grading-template";
import type { RubricaDelAlumno } from "@/lib/assessment-consigna";

/**
 * 0084 — Lo que el alumno ve de una evaluación ANTES de entregar: la consigna
 * (dibujada con `<Markdown>`, que arma elementos de React; nunca HTML), los
 * adjuntos y la rúbrica con la que se va a corregir (escala, mínimo, criterios,
 * puntos y la frase de cada nivel). Sin estado ni datos de la corrección.
 */
export function ConsignaView({
  instructionsMd,
  adjuntos,
  rubrica,
}: {
  instructionsMd: string;
  adjuntos: { id: string; title: string; url: string }[];
  rubrica: RubricaDelAlumno;
}) {
  const hayConsigna = instructionsMd.trim().length > 0;
  const hayRubrica = rubrica.scale === "numeric" && rubrica.criteria.length > 0;
  // Aprobado/no aprobado sin consigna ni adjuntos: no hay nada que mostrar.
  if (!hayConsigna && adjuntos.length === 0 && rubrica.scale !== "numeric") return null;

  return (
    <details className="rounded-md border border-border" open={!hayRubrica && hayConsigna}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-2">
        <FileText className="mr-1.5 inline h-3.5 w-3.5 text-text-3" strokeWidth={1.8} />
        Consigna{hayRubrica ? " y rúbrica" : ""}
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        {hayConsigna && <Markdown source={instructionsMd} className="text-sm text-text-2" />}

        {adjuntos.length > 0 && (
          <ul className="space-y-1">
            {adjuntos.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1.5 text-sm font-medium underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                  {a.title}
                </a>
              </li>
            ))}
          </ul>
        )}

        {rubrica.scale === "numeric" && (
          <p className="text-xs text-text-3">
            Nota de 1 a 100 · se aprueba con {rubrica.minScore}
          </p>
        )}

        {hayRubrica && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-xs">
              <thead>
                <tr className="text-left text-text-3">
                  <th className="border-b border-border py-1.5 pr-2 font-medium">Criterio</th>
                  {NIVELES.map((n) => (
                    <th key={n} className="border-b border-border px-2 py-1.5 font-medium">
                      {ETIQUETA_DE_NIVEL[n]}
                      <span className="block font-normal">{PORCENTAJE_DE_NIVEL[n]} %</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rubrica.criteria.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="border-b border-border py-1.5 pr-2 text-text-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-text-3">{c.maxPoints} puntos</span>
                    </td>
                    {NIVELES.map((n) => (
                      <td key={n} className="border-b border-border px-2 py-1.5 text-text-2">
                        <span className="text-text-3">{puntosDeNivel(n, c.maxPoints)} pts</span>
                        {c.levels?.[n] && <span className="block">{c.levels[n]}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
