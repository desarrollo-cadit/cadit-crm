"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, Send } from "lucide-react";
import type { BulkSendKind } from "@/lib/db/schema";
import { formatSentAt } from "@/lib/schedule-time";
import type { BulkKindOverview, BulkRunDto, BulkRunRecipientDto } from "@/server/bulk-sends";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";

/**
 * 2026-10-05 — Envíos a toda la cohorte: términos de la licencia ATC,
 * bienvenida al grupo de WhatsApp y acceso al portal.
 *
 * Siempre es una acción explícita: un botón, una confirmación con los
 * números ("se enviará a N; M ya lo recibieron") y recién ahí el envío. El
 * envío corre en el servidor de a uno; esta pantalla solo muestra el avance,
 * así que cerrarla no lo corta.
 */

const ETIQUETA: Record<BulkSendKind, { boton: string; titulo: string; correo: string }> = {
  terms: {
    boton: "Términos de la licencia",
    titulo: "Enviar los términos de la licencia a la cohorte",
    correo: "los términos de la licencia ATC",
  },
  welcome: {
    boton: "Bienvenida + grupo",
    titulo: "Enviar la bienvenida a la cohorte",
    correo: "la bienvenida con la invitación al grupo de WhatsApp",
  },
  portal_access: {
    boton: "Acceso al portal",
    titulo: "Dar acceso al portal a la cohorte",
    correo: "el acceso al portal (usuario y contraseña temporal)",
  },
};

const RUTA: Record<BulkSendKind, string> = {
  terms: "emails/bulk",
  welcome: "emails/bulk",
  portal_access: "access/bulk",
};

const RESULTADO: Record<
  BulkRunRecipientDto["outcome"],
  { texto: string; variante: "secondary" | "success" | "warning" | "destructive" }
> = {
  pending: { texto: "En espera", variante: "secondary" },
  sent: { texto: "Enviado", variante: "success" },
  skipped_already_sent: { texto: "Ya lo había recibido", variante: "secondary" },
  skipped_has_access: { texto: "Ya tiene acceso", variante: "secondary" },
  failed: { texto: "No se envió", variante: "destructive" },
};

const POLL_MS = 2000;

function alumnos(n: number) {
  return n === 1 ? "1 alumno" : `${n} alumnos`;
}

/** Unos 30 por minuto (la pausa entre correos): cuánto tarda, a grandes rasgos. */
function duracionEstimada(n: number) {
  const minutos = Math.ceil((n * 2) / 60);
  return minutos <= 1 ? "alrededor de un minuto" : `alrededor de ${minutos} minutos`;
}

export function BulkSendsPanel({
  cohortId,
  canManageAccess,
  onProgress,
}: {
  cohortId: string;
  /** `accesos.gestionar`: sin ella, el acceso al portal ni se ofrece (la ruta respondería 403). */
  canManageAccess: boolean;
  /** Avisa al roster que algo cambió, para que las marcas por alumno se vean al día. */
  onProgress: () => void;
}) {
  const [kinds, setKinds] = useState<BulkKindOverview[] | null>(null);
  const [confirmar, setConfirmar] = useState<BulkKindOverview | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corrida, setCorrida] = useState<BulkRunDto | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const pedidos = [fetch(`/api/cohorts/${cohortId}/emails/bulk`).catch(() => null)];
    if (canManageAccess) {
      pedidos.push(fetch(`/api/cohorts/${cohortId}/access/bulk`).catch(() => null));
    }
    const respuestas = await Promise.all(pedidos);
    const todos: BulkKindOverview[] = [];
    for (const res of respuestas) {
      if (res?.ok) todos.push(...((await res.json()) as { kinds: BulkKindOverview[] }).kinds);
    }
    setKinds(todos);
    const enCurso = todos.find((k) => k.latestRun?.status === "en_curso")?.latestRun;
    if (enCurso) setCorrida((actual) => actual ?? enCurso);
  }, [cohortId, canManageAccess]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!corrida || corrida.status !== "en_curso") return;
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/cohorts/${cohortId}/${RUTA[corrida.kind]}/${corrida.id}`
      ).catch(() => null);
      if (res?.ok) {
        const siguiente = (await res.json()) as BulkRunDto;
        setCorrida(siguiente);
        onProgress();
        if (siguiente.status !== "en_curso") void cargar();
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [corrida, cohortId, cargar, onProgress]);

  async function enviar(k: BulkKindOverview) {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/cohorts/${cohortId}/${RUTA[k.kind]}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(k.kind === "portal_access" ? {} : { kind: k.kind }),
    }).catch(() => null);
    setEnviando(false);
    setConfirmar(null);
    if (!res || res.status !== 202) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "No se pudo iniciar el envío.");
      void cargar();
      return;
    }
    const { runId } = (await res.json()) as { runId: string };
    const detalle = await fetch(`/api/cohorts/${cohortId}/${RUTA[k.kind]}/${runId}`).catch(
      () => null
    );
    if (detalle?.ok) setCorrida((await detalle.json()) as BulkRunDto);
    setDetalleAbierto(true);
  }

  if (!kinds || kinds.length === 0) return null;

  return (
    <section aria-labelledby="envios-cohorte" className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="envios-cohorte" className="text-sm font-semibold">
            Envíos a la cohorte
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada correo les llega solo a quienes todavía no lo recibieron.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => {
            const ocupado = corrida?.status === "en_curso";
            const sinDestino = k.counts.toSend === 0;
            return (
              <Button
                key={k.kind}
                variant="outline"
                size="sm"
                disabled={ocupado || sinDestino || Boolean(k.blockedReason)}
                title={
                  k.blockedReason ??
                  (sinDestino ? "Todos los alumnos con correo ya lo recibieron." : undefined)
                }
                onClick={() => setConfirmar(k)}
              >
                {k.kind === "portal_access" ? (
                  <KeyRound className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {ETIQUETA[k.kind].boton}
                <span className="text-muted-foreground">({k.counts.toSend})</span>
              </Button>
            );
          })}
        </div>
      </div>

      {kinds
        .filter((k) => k.blockedReason)
        .map((k) => (
          <p key={k.kind} className="mt-2 text-xs text-muted-foreground">
            {k.blockedReason}
          </p>
        ))}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {!corrida &&
        kinds
          .filter((k) => k.latestRun && k.latestRun.totals.failed > 0)
          .map((k) => (
            <p key={k.kind} className="mt-2 text-xs text-muted-foreground">
              El último envío de {ETIQUETA[k.kind].boton.toLowerCase()} (
              {formatSentAt(k.latestRun!.startedAt)}) no les llegó a{" "}
              {alumnos(k.latestRun!.totals.failed)}.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setCorrida(k.latestRun);
                  setDetalleAbierto(true);
                }}
              >
                Ver el detalle
              </button>
            </p>
          ))}

      {corrida && (
        <ProgresoDeCorrida
          corrida={corrida}
          abierto={detalleAbierto}
          onToggle={() => setDetalleAbierto((v) => !v)}
          onCerrar={() => setCorrida(null)}
        />
      )}

      {confirmar && (
        <ConfirmSendDialog
          title={ETIQUETA[confirmar.kind].titulo}
          confirmLabel={`Enviar a ${alumnos(confirmar.counts.toSend)}`}
          busy={enviando}
          onClose={() => setConfirmar(null)}
          onConfirm={() => void enviar(confirmar)}
        >
          <p className="text-foreground">
            Se enviará {ETIQUETA[confirmar.kind].correo} a {alumnos(confirmar.counts.toSend)}.
          </p>
          {confirmar.kind === "portal_access" ? (
            confirmar.counts.hasAccess > 0 && (
              <p>
                {confirmar.counts.hasAccess === 1
                  ? "1 alumno ya tiene"
                  : `${confirmar.counts.hasAccess} alumnos ya tienen`}{" "}
                acceso al portal y no se les reenvía: así no se les cambia la contraseña que ya
                usan.
              </p>
            )
          ) : (
            confirmar.counts.alreadySent > 0 && (
              <p>
                {confirmar.counts.alreadySent === 1
                  ? "1 alumno ya lo recibió"
                  : `${confirmar.counts.alreadySent} alumnos ya lo recibieron`}{" "}
                y no se les reenvía.
              </p>
            )
          )}
          {confirmar.counts.withoutEmail > 0 && (
            <p>
              {confirmar.counts.withoutEmail === 1
                ? "1 alumno no tiene correo cargado y va a figurar"
                : `${confirmar.counts.withoutEmail} alumnos no tienen correo cargado y van a figurar`}{" "}
              en el detalle con ese motivo.
            </p>
          )}
          {confirmar.counts.withdrawn > 0 && (
            <p>
              {confirmar.counts.withdrawn === 1
                ? "1 alumno dado de baja queda"
                : `${confirmar.counts.withdrawn} alumnos dados de baja quedan`}{" "}
              fuera del envío.
            </p>
          )}
          <p>
            Los correos salen de a uno, para no superar el límite del buzón: el envío lleva{" "}
            {duracionEstimada(confirmar.counts.toSend)} y se puede seguir usando el sistema
            mientras tanto. Un correo enviado no se puede deshacer.
          </p>
        </ConfirmSendDialog>
      )}
    </section>
  );
}

function ProgresoDeCorrida({
  corrida,
  abierto,
  onToggle,
  onCerrar,
}: {
  corrida: BulkRunDto;
  abierto: boolean;
  onToggle: () => void;
  onCerrar: () => void;
}) {
  const t = corrida.totals;
  const procesados = t.sent + t.failed + t.skipped_already_sent + t.skipped_has_access;
  const total = procesados + t.pending;

  return (
    <div className="mt-3 rounded-md border bg-subtle p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="flex items-center gap-1.5 text-foreground">
          <Send className="h-3.5 w-3.5" aria-hidden />
          {ETIQUETA[corrida.kind].boton}:{" "}
          {corrida.status === "en_curso"
            ? `enviando… ${procesados} de ${total}`
            : corrida.status === "terminada"
              ? `terminado el ${formatSentAt(corrida.finishedAt ?? corrida.startedAt)}`
              : "el envío se interrumpió"}
          {" · "}
          {t.sent} enviados
          {t.failed > 0 && ` · ${t.failed} sin enviar`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="underline" onClick={onToggle} aria-expanded={abierto}>
            {abierto ? "Ocultar el detalle" : "Ver el detalle"}
          </button>
          {corrida.status !== "en_curso" && (
            <button type="button" className="text-muted-foreground underline" onClick={onCerrar}>
              Cerrar
            </button>
          )}
        </div>
      </div>
      {corrida.status === "interrumpida" && (
        <p className="mt-1 text-muted-foreground">
          El sistema se reinició antes de terminar. Al enviar de nuevo, el correo les llega solo a
          quienes todavía no lo recibieron.
        </p>
      )}
      {abierto && (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {corrida.recipients.map((r) => (
            <li key={r.enrollmentId} className="flex flex-wrap items-baseline gap-2">
              <span className="min-w-[10rem] font-medium text-foreground">{r.name}</span>
              <Badge variant={RESULTADO[r.outcome].variante}>{RESULTADO[r.outcome].texto}</Badge>
              {r.message && <span className="text-muted-foreground">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
