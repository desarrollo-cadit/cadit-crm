"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ETIQUETA_DE_NIVEL,
  NIVELES,
  PORCENTAJE_DE_NIVEL,
  type Criterion,
  type Nivel,
  type Scale,
  type Template,
  type TextField,
} from "@/lib/grading-template";

/**
 * 031 (T014, US1) — El editor de la plantilla de corrección. PRESENTACIONAL:
 * recibe la plantilla, avisa cada cambio y delega el guardado. No hace fetch
 * ni decide permisos; quien lo monta sabe a qué ruta mandar lo que salga.
 *
 * La suma de los ejercicios se muestra EN VIVO con lo que falta o sobra: el
 * 422 del servidor queda como red, no como la primera noticia (US1, esc. 2).
 *
 * Los ejercicios y campos nuevos nacen con `id` vacío: el servidor les da uno
 * al guardar, y los existentes conservan el suyo porque las correcciones
 * guardadas apuntan a él.
 */
export function TemplateEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  frozen = false,
  saveLabel = "Guardar plantilla",
}: {
  /** 0084 — El editor de modelos del curso guarda la evaluación entera. */
  saveLabel?: string;
  value: Template;
  onChange: (t: Template) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  /**
   * Si ya hay correcciones publicadas (DV-008): escala, mínimo y puntajes no
   * se tocan. El servidor igual lo rechaza con 409; esto evita que la persona
   * arme un cambio entero para enterarse al final.
   */
  frozen?: boolean;
}) {
  const numerica = value.scale === "numeric";
  const suma = value.criteria.reduce((s, c) => s + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0);
  const sumaOk = value.criteria.length === 0 || suma === 100;

  function setScale(scale: Scale) {
    onChange(
      scale === "numeric"
        ? { ...value, scale, minScore: value.minScore ?? 60 }
        : // Pasar a aprobado/no aprobado descarta mínimo y ejercicios: en esa
          // escala no significan nada y el servidor los rechazaría.
          { ...value, scale, minScore: null, criteria: [] }
    );
  }

  function setCriterion(i: number, patch: Partial<Criterion>) {
    onChange({
      ...value,
      criteria: value.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });
  }

  /** 0084 — La frase de un nivel en un criterio. Vacía se descarta al guardar. */
  function setDescriptor(i: number, nivel: Nivel, texto: string) {
    const c = value.criteria[i];
    if (!c) return;
    setCriterion(i, { levels: { ...c.levels, [nivel]: texto } });
  }

  function setField(i: number, patch: Partial<TextField>) {
    onChange({
      ...value,
      textFields: value.textFields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Escala
          <Select
            className="h-8 w-56 text-sm"
            value={value.scale}
            disabled={frozen}
            onChange={(e) => setScale(e.target.value as Scale)}
          >
            <option value="pass_fail">Aprobado / no aprobado</option>
            <option value="numeric">Numérica de 1 a 100</option>
          </Select>
        </label>
        {numerica && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Nota mínima para aprobar
            <Input
              type="number"
              min={1}
              max={100}
              className="h-8 w-24"
              disabled={frozen}
              value={value.minScore ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  minScore: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
        )}
      </div>

      {numerica && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h5 className="text-xs font-semibold text-foreground">Ejercicios o criterios</h5>
            {value.criteria.length > 0 && (
              <span className={`text-xs ${sumaOk ? "text-success" : "text-danger"}`}>
                Suman {suma}
                {suma < 100 && ` · faltan ${100 - suma}`}
                {suma > 100 && ` · sobran ${suma - 100}`}
              </span>
            )}
          </div>
          {value.criteria.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin ejercicios, la nota se carga directa al corregir.
            </p>
          )}
          <ul className="space-y-3">
            {value.criteria.map((c, i) => (
              <li key={c.id || `nuevo-${i}`} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Nombre del ejercicio ${i + 1}`}
                  className="h-8 min-w-[12rem] flex-1"
                  placeholder={`Ejercicio ${i + 1}`}
                  value={c.name}
                  onChange={(e) => setCriterion(i, { name: e.target.value })}
                />
                <Input
                  type="number"
                  aria-label={`Puntaje máximo del ejercicio ${i + 1}`}
                  min={1}
                  max={100}
                  className="h-8 w-20"
                  disabled={frozen}
                  value={Number.isFinite(c.maxPoints) ? c.maxPoints : ""}
                  onChange={(e) => setCriterion(i, { maxPoints: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">puntos</span>
                {!frozen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar el ejercicio ${i + 1}`}
                    onClick={() =>
                      onChange({ ...value, criteria: value.criteria.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {/*
                0084 — La rúbrica: una frase por nivel (fijos, no se
                configuran). Opcionales; el alumno las ve ANTES de entregar.
              */}
              <div className="grid gap-2 pl-0 sm:grid-cols-2 sm:pl-3">
                {NIVELES.map((n) => (
                  <label key={n} className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                    {ETIQUETA_DE_NIVEL[n]} · {PORCENTAJE_DE_NIVEL[n]} %
                    <Input
                      aria-label={`${ETIQUETA_DE_NIVEL[n]} — ${c.name || `Ejercicio ${i + 1}`}`}
                      className="h-8 text-xs"
                      placeholder="Qué se ve en este nivel (opcional)"
                      maxLength={300}
                      disabled={frozen}
                      value={c.levels?.[n] ?? ""}
                      onChange={(e) => setDescriptor(i, n, e.target.value.replace(/[\r\n]+/g, " "))}
                    />
                  </label>
                ))}
              </div>
              </li>
            ))}
          </ul>
          {!frozen && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  criteria: [
                    ...value.criteria,
                    { id: "", name: "", maxPoints: Math.max(1, 100 - suma) },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Agregar ejercicio
            </Button>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h5 className="text-xs font-semibold text-foreground">Campos de texto</h5>
        <p className="text-xs text-muted-foreground">
          Lo que el corrector tiene que completar además de la nota, por ejemplo
          «Fortalezas» o «A mejorar». El alumno los ve cuando se publica la corrección.
        </p>
        <ul className="space-y-2">
          {value.textFields.map((f, i) => (
            <li key={f.id || `nuevo-${i}`} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Nombre del campo ${i + 1}`}
                className="h-8 min-w-[12rem] flex-1"
                placeholder="Fortalezas"
                value={f.name}
                onChange={(e) => setField(i, { name: e.target.value })}
              />
              <CheckboxField
                label="Obligatorio"
                checked={f.required}
                onChange={(e) => setField(i, { required: e.target.checked })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Quitar el campo ${i + 1}`}
                onClick={() =>
                  onChange({ ...value, textFields: value.textFields.filter((_, j) => j !== i) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...value,
              textFields: [...value.textFields, { id: "", name: "", required: false }],
            })
          }
        >
          <Plus className="h-4 w-4" />
          Agregar campo de texto
        </Button>
      </section>

      <CheckboxField
        label="Requiere aprobación: la corrección del profesor no se publica hasta que coordinación la apruebe"
        checked={value.requiresApproval}
        onChange={(e) => onChange({ ...value, requiresApproval: e.target.checked })}
      />

      {frozen && (
        <p className="text-xs text-warning">
          Ya hay correcciones publicadas: la escala, la nota mínima, los puntajes
          y las frases de cada nivel quedaron fijos. Los nombres se pueden corregir.
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!sumaOk} loading={saving} onClick={onSave}>
          {saving ? "Guardando…" : saveLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
