"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { formatSentAt } from "@/lib/schedule-time";
import {
  STAFF_NOTICE_LABELS,
  STAFF_NOTICE_STATUS_LABELS,
  type AvisoDto,
  type ConfirmacionDto,
} from "@/lib/staff-notices";
import { notify } from "@/lib/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";

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
}: {
  cohortId: string;
  initial: ConfirmacionDto;
  canConfirm: boolean;
}) {
  const [estado, setEstado] = useState(initial);
  const [dialogo, setDialogo] = useState<"confirmar" | "quitar" | null>(null);
  const [enVuelo, setEnVuelo] = useState(false);

  async function aplicar(accion: "confirmar" | "quitar") {
    setEnVuelo(true);
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/confirmation`, {
        method: accion === "confirmar" ? "POST" : "DELETE",
      }).catch(() => null);
      if (!res?.ok) {
        notify.error(await mensajeDeError(res, "No se pudo guardar. Probá de nuevo en un momento."));
        return;
      }
      const body = (await res.json()) as { confirmation: ConfirmacionDto };
      setEstado(body.confirmation);
      setDialogo(null);
      notify.success(
        accion === "confirmar"
          ? "Cohorte confirmada. Soporte recibe el aviso por correo."
          : "Se quitó la confirmación."
      );
    } finally {
      setEnVuelo(false);
    }
  }

  const confirmada = estado.confirmedAt !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {confirmada ? (
        <Badge variant="success">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          Confirmada
        </Badge>
      ) : (
        <Badge variant="outline">Sin confirmar</Badge>
      )}
      {confirmada ? (
        <span className="text-muted-foreground">
          {estado.confirmedBy ? `por ${estado.confirmedBy.name} ` : ""}
          el {formatSentAt(estado.confirmedAt!)}
        </span>
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
      {canConfirm ? (
        <div className="ml-auto">
          {confirmada ? (
            <Button variant="ghost" size="sm" onClick={() => setDialogo("quitar")}>
              Quitar confirmación
            </Button>
          ) : (
            <Button size="sm" onClick={() => setDialogo("confirmar")}>
              Confirmar cohorte
            </Button>
          )}
        </div>
      ) : null}

      {dialogo === "confirmar" ? (
        <ConfirmSendDialog
          title="Confirmar cohorte"
          confirmLabel="Confirmar cohorte"
          busyLabel="Confirmando…"
          busy={enVuelo}
          onConfirm={() => void aplicar("confirmar")}
          onClose={() => setDialogo(null)}
        >
          <p>
            La cohorte queda confirmada: sale. Soporte recibe por correo la lista de alumnos con las
            licencias que necesita cada uno.
          </p>
          <p>
            Siete y dos días antes del inicio, Administración recibe las inscripciones que todavía no
            tienen factura.
          </p>
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
