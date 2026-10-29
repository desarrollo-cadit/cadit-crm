"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ConsignaEditor } from "@/components/grading/consigna-editor";
import { TemplateEditor } from "@/components/grading/template-editor";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsignaInput } from "@/lib/assessment-consigna";
import { etiquetaDePlantilla, plantillaDe, type Template } from "@/lib/grading-template";
import { notify } from "@/lib/notify";
import type { CourseDto } from "@/lib/types";

/**
 * 0084 — Las evaluaciones MODELO de un curso (Académico, `academico.editar`).
 *
 * Un grupo las TOMA desde su pestaña de evaluaciones ("Tomar del curso"):
 * copia, nunca hereda. Por eso editar o borrar un modelo acá no toca ningún
 * grupo que ya lo haya tomado, y la pantalla lo dice.
 */

type Modelo = {
  id: string;
  name: string;
  position: number;
  required: boolean;
  instructionsMd: string;
  adjuntos: { id: string; title: string; url: string }[];
} & Template;

type Borrador = {
  id: string | null;
  name: string;
  required: boolean;
  consigna: ConsignaInput;
  template: Template;
};

function borradorDe(m: Modelo | null): Borrador {
  return {
    id: m?.id ?? null,
    name: m?.name ?? "",
    required: m?.required ?? true,
    consigna: {
      instructionsMd: m?.instructionsMd ?? "",
      adjuntos: (m?.adjuntos ?? []).map((a) => ({ title: a.title, url: a.url })),
    },
    template: plantillaDe(m ?? {}),
  };
}

export function AssessmentModelsDialog({
  course,
  onClose,
}: {
  course: CourseDto;
  onClose: () => void;
}) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/courses/${course.id}/assessment-models`).catch(() => null);
    if (!res?.ok) {
      notify.error("No se pudieron cargar las evaluaciones modelo.");
      setModelos([]);
      return;
    }
    setModelos(((await res.json()) as { models: Modelo[] }).models);
  }, [course.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    const res = await fetch(
      borrador.id
        ? `/api/course-assessment-models/${borrador.id}`
        : `/api/courses/${course.id}/assessment-models`,
      {
        method: borrador.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: borrador.name.trim(),
          required: borrador.required,
          instructionsMd: borrador.consigna.instructionsMd,
          adjuntos: borrador.consigna.adjuntos,
          template: borrador.template,
        }),
      }
    ).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudo guardar la evaluación modelo");
      return;
    }
    notify.success("Evaluación modelo guardada.");
    setBorrador(null);
    void cargar();
  }

  async function borrar(m: Modelo) {
    if (!window.confirm(`¿Borrar la evaluación modelo «${m.name}»? Los grupos que ya la tomaron conservan su copia.`)) {
      return;
    }
    const res = await fetch(`/api/course-assessment-models/${m.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      notify.error("No se pudo borrar la evaluación modelo.");
      return;
    }
    notify.success("Evaluación modelo borrada.");
    void cargar();
  }

  return (
    <Modal
      onClose={onClose}
      dirty={borrador !== null}
      busy={guardando}
      labelledBy="assessment-models-title"
      className="max-h-[90vh] max-w-3xl overflow-y-auto"
    >
      <div className="space-y-4">
        <div>
          <h2 id="assessment-models-title" className="text-base font-semibold">
            Evaluaciones modelo · {course.name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada grupo de este curso puede tomarlas desde su pestaña de evaluaciones. Se
            copian: cambiar un modelo después no cambia los grupos que ya lo tomaron.
          </p>
        </div>

        {modelos === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          !borrador && (
            <>
              {modelos.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Este curso todavía no tiene evaluaciones modelo.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {modelos.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {m.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {etiquetaDePlantilla(m)}
                          {m.criteria.length > 0 && ` · ${m.criteria.length} criterios`}
                          {!m.required && " · no obligatoria"}
                          {m.adjuntos.length > 0 && ` · ${m.adjuntos.length} adjuntos`}
                        </span>
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${m.name}`}
                          onClick={() => setBorrador(borradorDe(m))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Borrar ${m.name}`}
                          onClick={() => void borrar(m)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" onClick={() => setBorrador(borradorDe(null))}>
                <Plus className="h-4 w-4" /> Nueva evaluación modelo
              </Button>
            </>
          )
        )}

        {borrador && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="modelo-nombre">Nombre</Label>
                <Input
                  id="modelo-nombre"
                  placeholder="Trabajo final"
                  value={borrador.name}
                  onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
                />
              </div>
              <CheckboxField
                label="Obligatoria para aprobar"
                checked={borrador.required}
                onChange={(e) => setBorrador({ ...borrador, required: e.target.checked })}
              />
            </div>
            <ConsignaEditor
              value={borrador.consigna}
              onChange={(consigna) => setBorrador({ ...borrador, consigna })}
              disabled={guardando}
            />
            <TemplateEditor
              value={borrador.template}
              onChange={(template) => setBorrador({ ...borrador, template })}
              onSave={() => {
                if (!borrador.name.trim()) {
                  notify.error("Falta el nombre de la evaluación.");
                  return;
                }
                void guardar();
              }}
              onCancel={() => setBorrador(null)}
              saving={guardando}
              saveLabel="Guardar evaluación modelo"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
