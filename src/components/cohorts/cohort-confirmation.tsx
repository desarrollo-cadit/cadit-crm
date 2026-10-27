"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { formatSentAt } from "@/lib/schedule-time";
import {
  STAFF_NOTICE_LABELS,
  STAFF_NOTICE_STATUS_LABELS,
  type AvisoDto,
  type ConfirmacionDto,
} from "@/lib/staff-notices";
import { avisarAlConfirmarPorDefecto } from "@/lib/marca-de-confirmacion";
import type { CronogramaAutomatico } from "@/lib/cronograma-automatico";
import { avisarQueCambiaronLasClases } from "@/lib/clases-cambiaron";
import { notify } from "@/lib/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { UnconfirmedExits } from "@/components/cohorts/unconfirmed-exits";

const VARIANTE: Record<AvisoDto["status"], "success" | "warning" | "destructive" | "outline"> = {
  sent: "success",
  pending: "outline",
  skipped: "warning",
  failed: "destructive",
  cancelled: "outline",
};

const MOTIVO: Record<string, string> = {
  area_sin_configurar: "el área no tiene casilla configurada",
  nada_que_enviar: "todas las inscripciones tienen factura",
  correo_sin_configurar: "el correo (M365) no está configurado",
  sin_destinatarios: "nadie del equipo puede confirmar grupos",
  sin_aviso_por_eleccion: "se confirmó sin avisar por correo",
};

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/**
 * 039 — Confirmar la cohorte ("sale") desde su encabezado.
 *
 * El estado llega armado del servidor; los botones solo aparecen con
 * `cohortes.confirmar` (la ruta exige lo mismo: esto es lo que se VE, no la
 * barrera). Confirmar le avisa por correo a Soporte; quitar la confirmación
 * cancela los avisos de facturación que todavía no salieron.
 */
export function CohortConfirmation({
  cohortId,
  initial,
  canConfirm,
  canEdit = false,
  startDate,
  endDate,
}: {
  cohortId: string;
  initial: ConfirmacionDto;
  canConfirm: boolean;
  /** `academico.editar`: las salidas «Reprogramar» y «Borrar grupo». Las rutas exigen lo mismo. */
  canEdit?: boolean;
  startDate: string;
  endDate: string | null;
}) {
  const [estado, setEstado] = useState(initial);
  const [dialogo, setDialogo] = useState<"confirmar" | "quitar" | null>(null);
  // Un grupo que ya empezó se confirma sin mandarle a Soporte una lista vieja.
  const [avisar, setAvisar] = useState(() => avisarAlConfirmarPorDefecto(new Date(startDate), new Date()));
  const [enVuelo, setEnVuelo] = useState(false);

  async function aplicar(accion: "confirmar" | "quitar") {
    setEnVuelo(true);
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/confirmation`, {
        method: accion === "confirmar" ? "POST" : "DELETE",
        ...(accion === "confirmar"
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ avisar }) }
          : {}),
      }).catch(() => null);
      if (!res?.ok) {
        notify.error(await mensajeDeError(res, "No se pudo guardar. Probá de nuevo en un momento."));
        return;
      }
      const body = (await res.json()) as {
        confirmation: ConfirmacionDto;
        schedule?: CronogramaAutomatico | null;
      };
      setEstado(body.confirmation);
      setDialogo(null);
      notify.success(
        accion === "confirmar"
          ? avisar
            ? "Grupo confirmado. Soporte recibe el aviso por correo."
            : "Grupo confirmado, sin enviar correos."
          : "Se quitó la confirmación."
      );
      // 2026-10-27 — Confirmar genera el cronograma solo, o dice qué le falta.
      if (body.schedule?.estado === "generado") {
        // Especialización: algún módulo quedó sin clases por falta de datos.
        if (body.schedule.conFaltantes) notify.warning(body.schedule.mensaje);
        else notify.success(body.schedule.mensaje);
        avisarQueCambiaronLasClases(cohortId);
      } else if (body.schedule?.estado === "faltan_datos") {
        notify.warning(`Todavía no se generaron las clases. ${body.schedule.mensaje}`);
      }
    } finally {
      setEnVuelo(false);
    }
  }

  const confirmada = estado.confirmedAt !== null;
  // Llegó el día de inicio sin confirmar: rojo, con las salidas (`marcaDeConfirmacion`).
  const vencido = !confirmada && estado.marca === "sin_confirmar_vencido";
  /*
    2026-10-27 — Un módulo no se confirma por separado (el servidor responde
    422): lo confirma su especialización. Una confirmación que viene de ella
    se quita desde ella. Un módulo con confirmación PROPIA (de antes) sí puede
    quitársela.
  */
  const puedeConfirmar = canConfirm && !estado.esModulo;
  const puedeQuitar = canConfirm && !estado.deLaEspecializacion;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {confirmada ? (
        <Badge variant="success">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          Confirmado
        </Badge>
      ) : (
        <Badge
          variant={vencido ? "destructive" : "outline"}
          title={vencido ? "Llegó la fecha de inicio y el grupo no está confirmado" : undefined}
        >
          Sin confirmar
        </Badge>
      )}
      {vencido ? (
        <span className="text-danger">
          Ya llegó la fecha de inicio: confirmalo, reprogramalo o borralo.
        </span>
      ) : null}
      {confirmada ? (
        <span className="text-muted-foreground">
          {estado.deLaEspecializacion ? (
            <>
              desde la especialización{" "}
              <Link
                href={`/cohorts/${estado.deLaEspecializacion.id}`}
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                {estado.deLaEspecializacion.name}
              </Link>{" "}
            </>
          ) : null}
          {estado.confirmedBy ? `por ${estado.confirmedBy.name} ` : ""}
          el {formatSentAt(estado.confirmedAt!)}
        </span>
      ) : estado.esModulo ? (
        <span className="text-muted-foreground">Se confirma desde su especialización.</span>
      ) : null}
      {estado.avisos.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Avisos internos">
          {estado.avisos.map((a) => (
            <li key={a.kind}>
              <Badge
                variant={VARIANTE[a.status]}
                title={a.error ?? (a.detail ? MOTIVO[a.detail] ?? a.detail : undefined)}
              >
                {STAFF_NOTICE_LABELS[a.kind]}: {STAFF_NOTICE_STATUS_LABELS[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {(confirmada ? puedeQuitar : puedeConfirmar) || (vencido && canEdit) ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {vencido && canEdit ? (
            <UnconfirmedExits cohortId={cohortId} startDate={startDate} endDate={endDate} />
          ) : null}
          {confirmada ? (
            puedeQuitar ? (
              <Button variant="ghost" size="sm" onClick={() => setDialogo("quitar")}>
                Quitar confirmación
              </Button>
            ) : null
          ) : puedeConfirmar ? (
            <Button size="sm" onClick={() => setDialogo("confirmar")}>
              Confirmar grupo
            </Button>
          ) : null}
        </div>
      ) : null}

      {dialogo === "confirmar" ? (
        <ConfirmSendDialog
          title="Confirmar grupo"
          confirmLabel="Confirmar grupo"
          busyLabel="Confirmando…"
          busy={enVuelo}
          onConfirm={() => void aplicar("confirmar")}
          onClose={() => setDialogo(null)}
        >
          <p>El grupo queda confirmado: sale.</p>
          <label className="flex items-start gap-2 text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={avisar}
              onChange={(e) => setAvisar(e.target.checked)}
            />
            <span>
              Avisar a Soporte por correo, con la lista de alumnos y las licencias que necesita cada
              uno.
            </span>
          </label>
          {avisarAlConfirmarPorDefecto(new Date(startDate), new Date()) ? (
            <p>
              Siete y dos días antes del inicio, Administración recibe las inscripciones que todavía
              no tienen factura.
            </p>
          ) : (
            <p>
              El grupo ya empezó: no se manda ningún aviso de facturación, y el de Soporte solo si lo
              marcás.
            </p>
          )}
        </ConfirmSendDialog>
      ) : null}
      {dialogo === "quitar" ? (
        <ConfirmSendDialog
          title="Quitar la confirmación"
          confirmLabel="Quitar confirmación"
          busyLabel="Quitando…"
          busy={enVuelo}
          onConfirm={() => void aplicar("quitar")}
          onClose={() => setDialogo(null)}
        >
          <p>
            Los avisos de facturación que todavía no salieron se cancelan. Lo que ya se envió no se
            puede desenviar: si hace falta, avisale a Soporte.
          </p>
        </ConfirmSendDialog>
      ) : null}
    </div>
  );
}
