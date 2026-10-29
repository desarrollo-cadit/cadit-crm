"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ETIQUETA_DE_NIVEL,
  NIVELES,
  aproboConNota,
  notaDeCorreccion,
  puntosDeNivel,
  type Nivel,
  type Template,
} from "@/lib/grading-template";
import { cn } from "@/lib/utils";

/**
 * 031 (T023, DV-013) — El formulario de corrección. PRESENTACIONAL.
 *
 * Recibe la plantilla y lo que se está editando, avisa cada cambio y delega
 * guardar. No hace fetch ni decide permisos: los botones dependen del `mode`
 * que manda el servidor (FR-018). Lo usan el portal del profesor y el panel
 * del staff, cada uno por su puerta (`CorrectionPanel` es el contenedor).
 *
 * La nota se calcula EN VIVO con la misma función que usa el servidor
 * (`notaDeCorreccion`): la persona ve "80/100 · Aprobada" antes de publicar, y
 * el 422 del servidor queda como red. Con un ejercicio sin cargar no hay nota
 * —sumar lo que hay sería inventar una—.
 */

export type CorreccionEnEdicion = {
  submissionId: string | null;
  /** Solo numérica SIN ejercicios: la nota directa. */
  score: number | null;
  /** Solo aprobado/no aprobado. En numérica se deriva de la nota. */
  passed: boolean | null;
  feedback: string;
  /** 0084 — `level`: el nivel de la rúbrica elegido (los puntos se pueden ajustar). */
  criterionScores: { criterionId: string; points: number | null; comment: string; level: Nivel | null }[];
  textValues: { fieldId: string; value: string }[];
};

/** Lo guardado que puede sembrar el formulario (una versión de la API). */
export type VersionGuardada = {
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  criterionScores: {
    criterionId: string;
    points: number | null;
    comment: string | null;
    level?: Nivel | null;
  }[];
  textValues: { fieldId: string; value: string }[];
};

/**
 * 0084 — Elige el nivel del criterio `i`: los puntos pasan a ser los del
 * nivel (el corrector los puede ajustar después). Elegir el mismo otra vez lo
 * quita, junto con sus puntos.
 */
export function elegirNivel(
  t: Template,
  v: CorreccionEnEdicion,
  i: number,
  nivel: Nivel
): CorreccionEnEdicion {
  const c = t.criteria[i];
  if (!c) return v;
  return {
    ...v,
    criterionScores: v.criterionScores.map((s, j) => {
      if (j !== i) return s;
      if (s.level === nivel) return { ...s, level: null, points: null };
      return { ...s, level: nivel, points: puntosDeNivel(nivel, c.maxPoints) };
    }),
  };
}

/**
 * Un lugar por cada ejercicio y campo de la plantilla, en su orden, con lo
 * guardado si lo hay. Lo que la versión trae y la plantilla ya no tiene se
 * descarta: el servidor lo rechazaría igual.
 */
export function borradorDeCorreccion(
  t: Template,
  v: VersionGuardada | null
): CorreccionEnEdicion {
  return {
    submissionId: v?.submissionId ?? null,
    score: t.scale === "numeric" && t.criteria.length === 0 ? (v?.score ?? null) : null,
    passed: t.scale === "pass_fail" ? (v?.passed ?? null) : null,
    feedback: v?.feedback ?? "",
    criterionScores: t.criteria.map((c) => {
      const s = v?.criterionScores.find((x) => x.criterionId === c.id);
      return {
        criterionId: c.id,
        points: s?.points ?? null,
        comment: s?.comment ?? "",
        level: s?.level ?? null,
      };
    }),
    textValues: t.textFields.map((f) => ({
      fieldId: f.id,
      value: v?.textValues.find((x) => x.fieldId === f.id)?.value ?? "",
    })),
  };
}

const numeroONulo = (s: string) => (s.trim() === "" ? null : Number(s));

export function CorrectionForm({
  template,
  value,
  onChange,
  onAction,
  mode,
  saving,
  reviewComment = null,
  submissions = [],
}: {
  template: Template;
  value: CorreccionEnEdicion;
  onChange: (v: CorreccionEnEdicion) => void;
  onAction: (action: "draft" | "submit" | "publish") => void;
  /** DV-014 — lo decide el servidor: publicar o enviar a aprobación. */
  mode: "publish" | "submit";
  saving: boolean;
  /** FR-019 — por qué la devolvieron. Lo ve el corrector, nunca el alumno. */
  reviewComment?: string | null;
  /** Las entregas del alumno, para elegir cuál se corrige. Puede no haber (FR-014). */
  submissions?: { id: string; title: string | null; submittedAt: string }[];
}) {
  const numerica = template.scale === "numeric";
  const nota = notaDeCorreccion(template, value);
  const aprobada =
    nota !== null && template.minScore !== null ? aproboConNota(nota, template.minScore) : null;

  function setPuntaje(i: number, patch: Partial<CorreccionEnEdicion["criterionScores"][number]>) {
    onChange({
      ...value,
      criterionScores: value.criterionScores.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      {reviewComment && (
        <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning">
          <p className="font-medium">Te la devolvieron con este comentario:</p>
          <p className="mt-1 whitespace-pre-line">{reviewComment}</p>
        </div>
      )}

      {submissions.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Entrega que corregís
          <Select
            className="h-9"
            value={value.submissionId ?? ""}
            onChange={(e) => onChange({ ...value, submissionId: e.target.value || null })}
          >
            <option value="">Sin entrega asociada</option>
            {submissions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? "Entrega"} · {new Date(s.submittedAt).toLocaleDateString("es-UY")}
              </option>
            ))}
          </Select>
        </label>
      )}

      {numerica && template.criteria.length > 0 && (
        <ul className="space-y-3">
          {template.criteria.map((c, i) => {
            const s = value.criterionScores[i];
            return (
              <li key={c.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[10rem] flex-1 text-sm font-medium">{c.name}</span>
                  <Input
                    type="number"
                    aria-label={`Puntaje de ${c.name}`}
                    min={0}
                    max={c.maxPoints}
                    className="h-9 w-20"
                    value={s?.points ?? ""}
                    onChange={(e) => setPuntaje(i, { points: numeroONulo(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">de {c.maxPoints}</span>
                </div>
                {/*
                  0084 — Los cuatro niveles fijos. Elegir uno pone sus puntos;
                  el número de arriba se puede ajustar a mano.
                */}
                <div
                  role="group"
                  aria-label={`Nivel de ${c.name}`}
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                >
                  {NIVELES.map((n) => {
                    const elegido = s?.level === n;
                    const frase = c.levels?.[n];
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={elegido}
                        onClick={() => onChange(elegirNivel(template, value, i, n))}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          elegido
                            ? "border-brand bg-brand-tint text-brand-text"
                            : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <span className="font-medium">{ETIQUETA_DE_NIVEL[n]}</span>
                        <span className="ml-1">· {puntosDeNivel(n, c.maxPoints)} pts</span>
                        {frase && <span className="mt-0.5 block text-[11px] leading-snug">{frase}</span>}
                      </button>
                    );
                  })}
                </div>
                <Input
                  aria-label={`Comentario sobre ${c.name}`}
                  className="h-9"
                  placeholder="Comentario sobre este ejercicio (opcional)"
                  value={s?.comment ?? ""}
                  onChange={(e) => setPuntaje(i, { comment: e.target.value })}
                />
              </li>
            );
          })}
        </ul>
      )}

      {numerica && template.criteria.length === 0 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Nota (1 a 100)
          <Input
            type="number"
            min={1}
            max={100}
            className="h-9 w-24"
            value={value.score ?? ""}
            onChange={(e) => onChange({ ...value, score: numeroONulo(e.target.value) })}
          />
        </label>
      )}

      {numerica ? (
        <p className="text-sm">
          {nota === null ? (
            <span className="text-muted-foreground">
              {template.criteria.length > 0
                ? "Faltan puntajes: la nota aparece cuando estén todos."
                : "Sin nota todavía."}
            </span>
          ) : (
            <>
              <span className="font-semibold">{nota}/100</span>
              {aprobada !== null && (
                <span className={aprobada ? "text-success" : "text-danger"}>
                  {" · "}
                  {aprobada ? "Aprobada" : "No aprobada"} (aprueba con {template.minScore})
                </span>
              )}
            </>
          )}
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Resultado
          <Select
            className="h-9 w-48"
            value={value.passed === true ? "si" : value.passed === false ? "no" : ""}
            onChange={(e) =>
              onChange({
                ...value,
                passed: e.target.value === "" ? null : e.target.value === "si",
              })
            }
          >
            <option value="">Sin decidir</option>
            <option value="si">Aprobado</option>
            <option value="no">No aprobado</option>
          </Select>
        </label>
      )}

      {template.textFields.map((f, i) => (
        <label key={f.id} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {f.name}
          {f.required ? " (obligatorio)" : ""}
          <Textarea
            rows={2}
            value={value.textValues[i]?.value ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                textValues: value.textValues.map((t, j) =>
                  j === i ? { ...t, value: e.target.value } : t
                ),
              })
            }
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Devolución
        <Textarea
          rows={3}
          placeholder="Qué está bien, qué hay que corregir y con qué criterio."
          value={value.feedback}
          onChange={(e) => onChange({ ...value, feedback: e.target.value })}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        {mode === "publish"
          ? "Al publicar, el alumno ve la corrección completa y el resultado queda en la planilla."
          : "Esta evaluación requiere aprobación: el alumno la ve recién cuando coordinación la apruebe."}
      </p>

      <div className="flex flex-wrap gap-2">
        {mode === "publish" ? (
          <Button size="sm" loading={saving} onClick={() => onAction("publish")}>
            Publicar corrección
          </Button>
        ) : (
          <Button size="sm" loading={saving} onClick={() => onAction("submit")}>
            Enviar a aprobación
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onAction("draft")}>
          Guardar borrador
        </Button>
      </div>
    </div>
  );
}
