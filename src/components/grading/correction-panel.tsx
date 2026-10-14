"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CorrectionForm,
  borradorDeCorreccion,
  type CorreccionEnEdicion,
  type VersionGuardada,
} from "@/components/grading/correction-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Template } from "@/lib/grading-template";
import { notify } from "@/lib/notify";

/**
 * 031 (T024/T025, DV-013) — El CONTENEDOR del formulario de corrección.
 *
 * Lee y guarda contra el `endpoint` que le pasa cada pantalla: el portal del
 * profesor usa `/api/portal/assessments/…/corrections/…` y el panel del staff
 * `/api/assessments/…/corrections/…`. Son dos puertas (DV-014) y este
 * componente no elige ninguna: recibe la URL, y el `mode` que dibuja los
 * botones lo decide el servidor.
 */

type Version = VersionGuardada & {
  status: "draft" | "pending" | "published" | "superseded";
  correctedByName: string | null;
  reviewComment: string | null;
  publishedAt: string | null;
};

type Lectura = {
  template: Template;
  published: Version | null;
  inProgress: Version | null;
  submissions: { id: string; url: string; title: string | null; submittedAt: string }[];
  mode: "publish" | "submit";
};

export function CorrectionPanel({
  endpoint,
  entregaSugerida = null,
  onListo,
  onCancelar,
}: {
  endpoint: string;
  /** La entrega con la que se abre una corrección nueva (la última, si hay). */
  entregaSugerida?: string | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [valor, setValor] = useState<CorreccionEnEdicion | null>(null);
  const [guardando, setGuardando] = useState(false);

  /*
    `sigue` dice si esta carga todavía es la que vale. Una respuesta que llega
    tarde —el efecto corre dos veces en desarrollo, o la red tarda— le
    vaciaba el formulario a quien ya estaba corrigiendo: la pantalla mostraba
    una cosa y se guardaba otra. Se mira después de CADA espera.
  */
  const cargar = useCallback(async (sigue: () => boolean = () => true) => {
    const res = await fetch(endpoint).catch(() => null);
    if (!sigue()) return;
    if (!res?.ok) {
      // "No pude traerla" no se dibuja como "no hay corrección" (016/013).
      setFallo("No se pudo cargar la corrección.");
      return;
    }
    const data = (await res.json()) as Lectura;
    if (!sigue()) return;
    setFallo(null);
    setLectura(data);
    // Se edita sobre lo que está en trámite; si no hay, sobre lo publicado
    // (editar una publicada crea una versión nueva y la vieja sigue vigente).
    const base = data.inProgress ?? data.published;
    const borrador = borradorDeCorreccion(data.template, base);
    if (!base && entregaSugerida) borrador.submissionId = entregaSugerida;
    setValor(borrador);
  }, [endpoint, entregaSugerida]);

  useEffect(() => {
    let vigente = true;
    void cargar(() => vigente);
    return () => {
      vigente = false;
    };
  }, [cargar]);

  async function guardar(action: "draft" | "submit" | "publish") {
    if (!valor || !lectura) return;
    setGuardando(true);
    const numerica = lectura.template.scale === "numeric";
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        submissionId: valor.submissionId,
        score: numerica && lectura.template.criteria.length === 0 ? valor.score : null,
        passed: numerica ? null : valor.passed,
        feedback: valor.feedback.trim() || null,
        criterionScores: valor.criterionScores.map((c) => ({
          criterionId: c.criterionId,
          points: c.points,
          comment: c.comment.trim() || null,
        })),
        textValues: valor.textValues,
      }),
    }).catch(() => null);
    setGuardando(false);

    if (!res?.ok) {
      // La frase del servidor dice QUÉ falta ("Falta el puntaje de «Render»").
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo guardar la corrección.");
      return;
    }
    notify.success(
      action === "publish"
        ? "Corrección publicada."
        : action === "submit"
          ? "Corrección enviada a aprobación."
          : "Borrador guardado."
    );
    onListo();
  }

  if (fallo && !lectura) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <p className="text-sm text-danger">{fallo}</p>
        <Button size="sm" variant="outline" onClick={() => void cargar()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!lectura || !valor) return <Skeleton className="h-32 w-full" />;

  const vigente = lectura.published;
  const pendiente = lectura.inProgress?.status === "pending";

  return (
    <div className="space-y-2">
      {vigente && (
        <p className="text-xs text-muted-foreground">
          Vigente:{" "}
          {vigente.score !== null ? `${vigente.score}/100 · ` : ""}
          {vigente.passed ? "aprobada" : "no aprobada"}
          {vigente.correctedByName && ` · ${vigente.correctedByName}`}
          {vigente.publishedAt &&
            ` · ${new Date(vigente.publishedAt).toLocaleDateString("es-UY")}`}
          . Lo que guardes ahora es una versión nueva: la vigente sigue hasta
          que se publique la otra.
        </p>
      )}
      {pendiente ? (
        /*
          Una versión esperando aprobación no se edita (409 `en_aprobacion`):
          se dice acá en vez de dejar armar una corrección entera para
          enterarse al guardar.
        */
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-sm">
            Esta corrección está esperando aprobación. Se puede volver a editar
            cuando la aprueben o te la devuelvan.
          </p>
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cerrar
          </Button>
        </div>
      ) : (
        <>
          <CorrectionForm
            template={lectura.template}
            value={valor}
            onChange={setValor}
            onAction={(a) => void guardar(a)}
            mode={lectura.mode}
            saving={guardando}
            reviewComment={lectura.inProgress?.reviewComment ?? null}
            submissions={lectura.submissions}
          />
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </>
      )}
    </div>
  );
}
