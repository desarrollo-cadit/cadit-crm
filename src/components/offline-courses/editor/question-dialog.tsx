"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { answerSetProblem, MAX_ANSWERS, type EditorAnswerType } from "@/lib/offline-course-editor";
import { callApi, coursePath } from "./api";
import { EditorDialog, ErrorText } from "./dialog";
import { MarkdownField } from "./markdown-field";
import type { Question } from "./quizzes-editor";

type DraftAnswer = { key: string; id?: string; text: string; isCorrect: boolean };

let draftKey = 0;
const blank = (): DraftAnswer => ({ key: `new-${++draftKey}`, text: "", isCorrect: false });

/**
 * cursos-offline T11b — New question / edit question with its answers.
 *
 * The answers are sent as the WHOLE set (existing ones with their id, new
 * ones without): the server replaces the set. Before sending, the form runs
 * the same rule as the server (`answerSetProblem`): ≥ 2 answers, exactly one
 * correct for "single", at least one for "multiple". The correct marks are
 * radios for "single" and checkboxes for "multiple", so the control itself
 * says which rule applies.
 */
export function QuestionDialog({
  courseId,
  quizId,
  question,
  onClose,
  onSaved,
}: {
  courseId: string;
  quizId: string;
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const typeId = useId();
  const pointsId = useId();
  const groupName = useId();
  const [text, setText] = useState(question?.questionMd ?? "");
  const [answerType, setAnswerType] = useState<EditorAnswerType>(question?.answerType ?? "single");
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [answers, setAnswers] = useState<DraftAnswer[]>(
    question
      ? question.answers.map((a) => ({ key: a.id, id: a.id, text: a.text, isCorrect: a.isCorrect }))
      : [blank(), blank()]
  );
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setProblem = answerSetProblem(answerType, answers);
  const emptyAnswer = answers.some((a) => !a.text.trim());

  function update(key: string, change: Partial<DraftAnswer>) {
    setAnswers((prev) => prev.map((a) => (a.key === key ? { ...a, ...change } : a)));
  }

  function markCorrect(key: string, checked: boolean) {
    setAnswers((prev) =>
      prev.map((a) =>
        answerType === "single" ? { ...a, isCorrect: a.key === key } : a.key === key ? { ...a, isCorrect: checked } : a
      )
    );
  }

  async function save() {
    setTried(true);
    if (!text.trim()) return setError("Falta la pregunta.");
    const pts = points.trim();
    if (!/^\d+$/.test(pts) || Number(pts) > 1000) {
      return setError("Los puntos van de 0 a 1000, sin decimales.");
    }
    if (emptyAnswer) return setError("Una respuesta no puede estar vacía.");
    // Shown live under the answers (and it clears itself once fixed).
    if (setProblem) return setError(null);

    setSaving(true);
    setError(null);
    const body = {
      questionMd: text,
      answerType,
      points: Number(pts),
      answers: answers.map((a) => ({ ...(a.id ? { id: a.id } : {}), text: a.text, isCorrect: a.isCorrect })),
    };
    const base = `${coursePath(courseId)}/quizzes/${quizId}/questions`;
    const result = question
      ? await callApi(`${base}/${question.id}`, "PATCH", body)
      : await callApi(base, "POST", body);
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.message);
  }

  return (
    <EditorDialog
      title={question ? "Editar pregunta" : "Nueva pregunta"}
      onClose={onClose}
      busy={saving}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <MarkdownField label="Pregunta" value={text} onChange={setText} rows={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={typeId}>Tipo</Label>
          <Select
            id={typeId}
            value={answerType}
            onChange={(e) => setAnswerType(e.target.value === "multiple" ? "multiple" : "single")}
          >
            <option value="single">Opción única (una correcta)</option>
            <option value="multiple">Opción múltiple (varias correctas)</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={pointsId}>Puntos</Label>
          <Input
            id={pointsId}
            type="number"
            min={0}
            max={1000}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Respuestas{" "}
          <span className="font-normal text-muted-foreground">
            · marcá {answerType === "single" ? "la correcta" : "las correctas"}
          </span>
        </legend>
        <ol className="space-y-1.5">
          {answers.map((a, i) => (
            <li key={a.key} className="flex items-center gap-2">
              <input
                type={answerType === "single" ? "radio" : "checkbox"}
                name={groupName}
                checked={a.isCorrect}
                aria-label={`Respuesta ${i + 1} correcta`}
                onChange={(e) => markCorrect(a.key, e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
              />
              <Input
                value={a.text}
                maxLength={2000}
                aria-label={`Texto de la respuesta ${i + 1}`}
                aria-invalid={(tried && !a.text.trim()) || undefined}
                placeholder={`Respuesta ${i + 1}`}
                onChange={(e) => update(a.key, { text: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Quitar la respuesta ${i + 1}`}
                title="Quitar"
                onClick={() => setAnswers((prev) => prev.filter((x) => x.key !== a.key))}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="ghost"
          disabled={answers.length >= MAX_ANSWERS}
          onClick={() => setAnswers((prev) => [...prev, blank()])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Agregar respuesta
        </Button>
        {tried && setProblem && (
          <p role="alert" className="text-xs text-destructive">
            {setProblem}
          </p>
        )}
      </fieldset>
      <ErrorText>{error}</ErrorText>
    </EditorDialog>
  );
}
