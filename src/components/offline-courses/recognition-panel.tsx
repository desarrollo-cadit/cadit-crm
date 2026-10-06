"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { StaffCourseProgress } from "@/server/offline-courses/progress";
import type { StaffRecognition } from "@/server/offline-courses/recognition";

/**
 * cursos-offline — Recognizing what a student completed in the previous
 * academy: the whole course or some of its lessons, always with a reason.
 *
 * The confirmation is the panel itself, not a `confirm()`: the reason written
 * here is what tells, months later, a decision of the academy from a mistake.
 * Recognizing never touches what the student did here (topic progress, quiz
 * attempts), and revoking leaves that intact too.
 */

export const formatRecognitionDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });

/** "Reconocido (Completado en la academia anterior · Ana Pérez, 06/10/2026)". */
export function recognitionLabel(r: StaffRecognition): string {
  const who = [r.recognizedByName, formatRecognitionDate(r.recognizedAt)].filter(Boolean).join(", ");
  return `Reconocido (${r.reason} · ${who})`;
}

type Mode = "course" | "lessons";

async function errorMessage(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function RecognitionActions({
  enrollmentId,
  progress,
  busy,
  onBusy,
  onDone,
}: {
  enrollmentId: string;
  progress: StaffCourseProgress;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  /** Reloads the panel; `error` is shown by the parent until the next change. */
  onDone: (error: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [lessonIds, setLessonIds] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const courseRecognition = progress.recognitions.find((r) => r.lessonId === null) ?? null;
  const pendingLessons = progress.lessons.filter((l) => !l.recognized);
  const lessonTitle = new Map(progress.lessons.map((l) => [l.id, l.title]));

  function open(next: Mode) {
    setMode(next);
    setReason("");
    setLessonIds([]);
    setRevoking(null);
  }

  async function recognize() {
    if (!mode) return;
    onBusy(true);
    const body =
      mode === "course"
        ? { scope: "course", courseId: progress.courseId, reason }
        : { scope: "lessons", courseId: progress.courseId, lessonIds, reason };
    const res = await fetch(`/api/enrollments/${enrollmentId}/offline-courses/recognitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const error = res?.ok ? null : await errorMessage(res, "No pudimos guardar el reconocimiento");
    if (!error) setMode(null);
    onBusy(false);
    onDone(error);
  }

  async function revoke(id: string) {
    onBusy(true);
    const res = await fetch(`/api/enrollments/${enrollmentId}/offline-courses/recognitions/${id}`, {
      method: "DELETE",
    }).catch(() => null);
    const error = res?.ok ? null : await errorMessage(res, "No pudimos quitar el reconocimiento");
    setRevoking(null);
    onBusy(false);
    onDone(error);
  }

  const canConfirm = reason.trim().length > 0 && (mode === "course" || lessonIds.length > 0);

  return (
    <div className="mt-2 space-y-2">
      {progress.recognitions.length > 0 && (
        <ul className="space-y-1">
          {progress.recognitions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1">
              <span className="flex-1">
                <span className="font-medium text-brand-text">
                  {r.lessonId === null
                    ? "Curso completo reconocido"
                    : `Lección reconocida: ${lessonTitle.get(r.lessonId) ?? "lección"}`}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {r.reason} · {[r.recognizedByName, formatRecognitionDate(r.recognizedAt)].filter(Boolean).join(", ")}
                </span>
              </span>
              {revoking === r.id ? (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">
                    ¿Quitar el reconocimiento? Lo que el alumno hizo en la plataforma no cambia.
                  </span>
                  <Button variant="destructive" size="sm" className="h-7" disabled={busy} onClick={() => void revoke(r.id)}>
                    Quitar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => setRevoking(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  disabled={busy}
                  onClick={() => {
                    setMode(null);
                    setRevoking(r.id);
                  }}
                >
                  Quitar reconocimiento
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!courseRecognition && mode === null && (
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" className="h-7" disabled={busy} onClick={() => open("course")}>
            Reconocer curso completo
          </Button>
          {pendingLessons.length > 0 && (
            <Button variant="outline" size="sm" className="h-7" disabled={busy} onClick={() => open("lessons")}>
              Reconocer lecciones…
            </Button>
          )}
        </div>
      )}

      {mode && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="text-sm font-semibold text-foreground">
            {mode === "course" ? "Reconocer el curso completo" : "Reconocer lecciones"}
          </p>
          <p className="text-muted-foreground">
            {mode === "course"
              ? "El curso entero, con sus temas y cuestionarios, cuenta como completado. El alumno lo ve como «Reconocido» y puede volver a repasarlo cuando quiera."
              : "Los temas de las lecciones elegidas, y los cuestionarios que dependen de ellas, cuentan como completados. El alumno continúa desde la primera lección pendiente."}
          </p>

          {mode === "lessons" && (
            <fieldset className="space-y-1">
              <legend className="mb-1 text-muted-foreground">Lecciones</legend>
              {pendingLessons.map((l) => (
                <CheckboxField
                  key={l.id}
                  label={l.title}
                  checked={lessonIds.includes(l.id)}
                  onChange={(e) =>
                    setLessonIds((ids) =>
                      e.target.checked ? [...ids, l.id] : ids.filter((id) => id !== l.id)
                    )
                  }
                />
              ))}
            </fieldset>
          )}

          <label className="flex flex-col gap-1 text-muted-foreground">
            Motivo
            <Textarea
              autoFocus
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Completado en la academia anterior"
              className="text-xs"
            />
          </label>
          <p className="text-muted-foreground">
            El motivo queda registrado con tu nombre y la fecha; el alumno ve solo «Reconocido».
          </p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" className="h-7" disabled={!canConfirm} loading={busy} onClick={() => void recognize()}>
              Confirmar reconocimiento
            </Button>
            <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => setMode(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
