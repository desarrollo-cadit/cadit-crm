"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/offline-courses/markdown";
import { EmptyNote, PortalCard, SectionTitle, formatDate } from "@/components/portal/student-bits";
import {
  BackLink,
  LoadFallback,
  OFFLINE_BASE,
  QuizStatusBadge,
  usePortalJson,
} from "@/components/portal/student-offline-courses";
import { cn } from "@/lib/utils";
import type { StudentOfflineQuiz } from "@/server/offline-courses/student";

/**
 * cursos-offline (T5) — Taking a quiz.
 *
 * The screen never knows which answers are correct: the quiz it receives has
 * no such field and the submission answers score + passed only. So it cannot
 * show them, before or after an attempt — by construction, not by care.
 */

type Result = {
  scorePercentage: number;
  passed: boolean;
  attemptNumber: number;
  attemptsRemaining: number | null;
};

const pct = (n: number) => `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })}%`;

export function StudentOfflineQuizClient({ courseId, quizId }: { courseId: string; quizId: string }) {
  const { load, refetch } = usePortalJson<{ quiz: StudentOfflineQuiz }>(
    `/api/portal/me/offline-courses/${courseId}/quizzes/${quizId}`
  );
  const [result, setResult] = useState<Result | null>(null);
  // Bumped after each recorded attempt: the form remounts with empty choices.
  const [round, setRound] = useState(0);
  const back = `${OFFLINE_BASE}/${courseId}`;

  if (load.state !== "ok") {
    return (
      <div className="space-y-5">
        <BackLink href={back}>Volver al curso</BackLink>
        <LoadFallback load={load} notFound="Cuestionario no encontrado" />
      </div>
    );
  }

  const quiz = load.data.quiz;
  return (
    <div className="space-y-5">
      <BackLink href={back}>{quiz.course.title}</BackLink>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{quiz.title}</h1>
          <QuizStatusBadge quiz={quiz} />
        </div>
        <p className="text-sm text-text-3">
          Se aprueba con {quiz.passingPercentage}% ·{" "}
          {quiz.maxAttempts === null
            ? "intentos ilimitados"
            : `${quiz.attemptsUsed} de ${quiz.maxAttempts} ${quiz.maxAttempts === 1 ? "intento usado" : "intentos usados"}`}
        </p>
        {quiz.descriptionMd && <Markdown source={quiz.descriptionMd} className="text-muted-foreground" />}
      </header>

      {result ? (
        <ResultCard result={result} onDismiss={() => setResult(null)} />
      ) : (
        <QuizForm
          key={round}
          courseId={courseId}
          quiz={quiz}
          onResult={(r) => {
            setResult(r);
            setRound((n) => n + 1);
            void refetch();
          }}
          onConflict={refetch}
        />
      )}

      <section className="space-y-3">
        <SectionTitle>Mis intentos</SectionTitle>
        {quiz.attempts.length === 0 ? (
          <p className="text-sm text-text-3">Todavía no hay intentos.</p>
        ) : (
          <PortalCard>
            <ul className="divide-y divide-border">
              {quiz.attempts.map((a) => (
                <li
                  key={a.attemptNumber}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm"
                >
                  <span className="font-medium">Intento {a.attemptNumber}</span>
                  <span className="text-text-3">{formatDate(a.createdAt)}</span>
                  <span className="ml-auto tabular-nums">{pct(a.scorePercentage)}</span>
                  {a.passed ? (
                    <Badge variant="success">Aprobado</Badge>
                  ) : (
                    <Badge variant="destructive">No aprobado</Badge>
                  )}
                </li>
              ))}
            </ul>
          </PortalCard>
        )}
      </section>
    </div>
  );
}

function ResultCard({ result, onDismiss }: { result: Result; onDismiss: () => void }) {
  return (
    <PortalCard
      className={cn(
        "space-y-3",
        result.passed ? "border-success-border bg-success-soft" : "border-danger-border bg-danger-soft"
      )}
      role="status"
    >
      <p className={cn("text-sm font-semibold", result.passed ? "text-success" : "text-danger")}>
        {result.passed ? "Aprobado" : "No aprobado"}
      </p>
      <p className="text-3xl font-semibold tabular-nums">{pct(result.scorePercentage)}</p>
      <p className="text-sm text-text-2">
        Intento {result.attemptNumber} ·{" "}
        {result.attemptsRemaining === null
          ? "intentos ilimitados"
          : result.attemptsRemaining === 0
            ? "no quedan más intentos"
            : `${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? "intento restante" : "intentos restantes"}`}
      </p>
      <Button type="button" variant="outline" onClick={onDismiss}>
        {result.attemptsRemaining === 0 ? "Cerrar" : "Volver al cuestionario"}
      </Button>
    </PortalCard>
  );
}

function QuizForm({
  courseId,
  quiz,
  onResult,
  onConflict,
}: {
  courseId: string;
  quiz: StudentOfflineQuiz;
  onResult: (result: Result) => void;
  /** 409: the attempts changed under this screen — reload them. */
  onConflict: () => Promise<void>;
}) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAttempt = quiz.attemptsRemaining === null || quiz.attemptsRemaining > 0;
  const unanswered = quiz.questions.filter((q) => (chosen[q.id] ?? []).length === 0).length;

  function pick(questionId: string, answerId: string, multiple: boolean, checked: boolean) {
    setConfirmBlank(false);
    setChosen((prev) => {
      const current = prev[questionId] ?? [];
      const next = multiple
        ? checked
          ? [...current, answerId]
          : current.filter((id) => id !== answerId)
        : [answerId];
      return { ...prev, [questionId]: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unanswered > 0 && !confirmBlank) {
      setConfirmBlank(true);
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch(
      `/api/portal/me/offline-courses/${courseId}/quizzes/${quiz.id}/attempts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: chosen }),
      }
    ).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { result?: Result; error?: { message?: string } }
      | null;
    setSending(false);

    if (res?.ok && body?.result) {
      onResult(body.result);
      return;
    }
    setError(body?.error?.message ?? "No se pudo enviar el cuestionario. Probá de nuevo.");
    // The choices stay on screen: reloading only refreshes the attempts count.
    if (res?.status === 409) await onConflict();
  }

  if (!canAttempt) {
    return (
      <EmptyNote title="No quedan intentos para este cuestionario">
        Ya se usaron todos los intentos disponibles. Si necesitás otro, consultá con la academia.
      </EmptyNote>
    );
  }

  if (quiz.questions.length === 0) {
    return <EmptyNote title="Este cuestionario no tiene preguntas cargadas" />;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {quiz.questions.map((q, i) => {
        const multiple = q.answerType === "multiple";
        const labelId = `q-${q.id}`;
        return (
          <PortalCard key={q.id}>
            <fieldset aria-labelledby={labelId} className="space-y-3">
              <div id={labelId} className="space-y-1">
                <p className="text-xs font-medium text-text-3">
                  Pregunta {i + 1} de {quiz.questions.length}
                  {multiple && " · puede elegir más de una"}
                </p>
                <Markdown source={q.questionMd} className="font-medium" />
              </div>
              <div className="space-y-1">
                {q.answers.map((a) => {
                  const checked = (chosen[q.id] ?? []).includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                        checked ? "border-brand bg-brand-tint" : "border-border hover:bg-accent"
                      )}
                    >
                      <input
                        type={multiple ? "checkbox" : "radio"}
                        name={q.id}
                        value={a.id}
                        checked={checked}
                        onChange={(e) => pick(q.id, a.id, multiple, e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span>{a.text}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </PortalCard>
        );
      })}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {confirmBlank && (
        <p role="alert" className="text-sm text-warning">
          {unanswered === 1
            ? "Hay 1 pregunta sin responder; cuenta como incorrecta."
            : `Hay ${unanswered} preguntas sin responder; cuentan como incorrectas.`}{" "}
          Enviá de nuevo para confirmar.
        </p>
      )}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? "Enviando…" : confirmBlank ? "Enviar de todos modos" : "Enviar respuestas"}
      </Button>
    </form>
  );
}
