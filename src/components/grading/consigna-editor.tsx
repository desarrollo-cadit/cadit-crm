"use client";

import { Plus, Trash2 } from "lucide-react";
import { MarkdownField } from "@/components/offline-courses/editor/markdown-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADJUNTOS_MAX, type ConsignaInput } from "@/lib/assessment-consigna";

/**
 * 0084 — El editor de la CONSIGNA de una evaluación: el texto (con la misma
 * vista previa que ve el alumno, `MarkdownField`) y los enlaces adjuntos.
 * PRESENTACIONAL: recibe el valor y avisa cada cambio; lo monta el editor del
 * grupo (`/api/assessments/[id]/consigna`) y el de los modelos del curso.
 *
 * La consigna no se congela: se puede aclarar aunque ya haya correcciones.
 */
export function ConsignaEditor({
  value,
  onChange,
  disabled,
}: {
  value: ConsignaInput;
  onChange: (v: ConsignaInput) => void;
  disabled?: boolean;
}) {
  function setAdjunto(i: number, patch: Partial<ConsignaInput["adjuntos"][number]>) {
    onChange({
      ...value,
      adjuntos: value.adjuntos.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });
  }

  return (
    <div className="space-y-3">
      <MarkdownField
        label="Consigna"
        rows={6}
        disabled={disabled}
        value={value.instructionsMd}
        onChange={(instructionsMd) => onChange({ ...value, instructionsMd })}
        hint="Qué tiene que hacer el alumno. Admite **negrita**, *cursiva*, listas y enlaces [texto](https://…)."
      />
      <section className="space-y-2">
        <h5 className="text-xs font-semibold text-foreground">Adjuntos</h5>
        <p className="text-xs text-muted-foreground">
          Enlaces a los archivos de la consigna (Drive, Autodesk Docs…). Guardamos
          solo el enlace. El alumno los ve mientras tenga acceso al curso.
        </p>
        {value.adjuntos.length > 0 && (
          <ul className="space-y-2">
            {value.adjuntos.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Título del adjunto ${i + 1}`}
                  className="h-8 min-w-[10rem] flex-1"
                  placeholder="Planos base"
                  disabled={disabled}
                  value={a.title}
                  onChange={(e) => setAdjunto(i, { title: e.target.value })}
                />
                <Input
                  type="url"
                  aria-label={`Enlace del adjunto ${i + 1}`}
                  className="h-8 min-w-[14rem] flex-[2]"
                  placeholder="https://…"
                  disabled={disabled}
                  value={a.url}
                  onChange={(e) => setAdjunto(i, { url: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar el adjunto ${i + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange({ ...value, adjuntos: value.adjuntos.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || value.adjuntos.length >= ADJUNTOS_MAX}
          onClick={() => onChange({ ...value, adjuntos: [...value.adjuntos, { title: "", url: "" }] })}
        >
          <Plus className="h-4 w-4" />
          Agregar adjunto
        </Button>
      </section>
    </div>
  );
}
