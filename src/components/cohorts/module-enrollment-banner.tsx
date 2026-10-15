"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type VistaPrevia = {
  resumen: { inscripciones: number; alumnos: number; modulos: number };
  existentes: number;
  aCrear: { parentEnrollmentId: string; contactName: string; modules: string[] }[];
  excluidas: {
    parentEnrollmentId: string;
    contactName: string;
    moduleLabel: string | null;
    motivo: string;
    detalle: string;
  }[];
};

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * 034 (FR-005 / FR-005a) — El aviso del faltante y la regularización.
 *
 * Los módulos creados antes de esta fase no inscribían a nadie: EBIM 14 tenía
 * 4 módulos, 9 alumnos y 0 inscripciones a módulo. El aviso dice el faltante
 * con números ("9 alumnos sin inscribir en 4 módulos") y la acción se ejecuta
 * en DOS pasos: primero la vista previa —qué se crea, qué ya estaba, a quién
 * se deja afuera y por qué— y recién después la confirmación. Es idempotente:
 * apretar dos veces no crea nada la segunda.
 *
 * El aviso y la vista previa salen del MISMO endpoint, así que no pueden
 * discrepar. La regla vive en `src/lib/module-auto-enroll.ts`.
 */
export function ModuleEnrollmentBanner({
  cohortId,
  canEditEnrollments,
  onDone,
}: {
  cohortId: string;
  /** `inscripciones.editar` — ejecutar la regularización. */
  canEditEnrollments: boolean;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<VistaPrevia | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/modules/enrollments`).catch(() => null);
    // Sin la vista previa no se afirma nada: ni "falta" ni "está todo".
    if (!res?.ok) return;
    setPreview((await res.json()) as VistaPrevia);
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function confirmar() {
    setGuardando(true);
    const res = await fetch(`/api/cohorts/${cohortId}/modules/enrollments`, {
      method: "POST",
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudieron crear las inscripciones a los módulos");
      return;
    }
    const hecho = (await res.json()) as VistaPrevia;
    notify.success(
      hecho.resumen.inscripciones === 0
        ? "No faltaba ninguna inscripción."
        : `Se crearon ${plural(hecho.resumen.inscripciones, "inscripción", "inscripciones")} a módulos.`,
      { description: "Sin cuotas ni vendedor: el pago sigue siendo el de la especialización." }
    );
    setAbierto(false);
    await cargar();
    onDone();
  }

  if (!preview) return null;
  const { resumen } = preview;
  const falta = resumen.inscripciones > 0;

  if (!falta && !abierto) {
    return canEditEnrollments ? (
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Revisar inscripciones a módulos
        </Button>
      </div>
    ) : null;
  }

  return (
    <section
      aria-label="Inscripciones a módulos"
      className={`rounded-lg border p-4 text-sm ${
        falta ? "border-warning-border bg-warning-soft" : "bg-card"
      }`}
    >
      {falta ? (
        <p className="font-medium text-foreground">
          {plural(resumen.alumnos, "alumno sin inscribir", "alumnos sin inscribir")} en{" "}
          {plural(resumen.modulos, "módulo", "módulos")} (faltan{" "}
          {plural(resumen.inscripciones, "inscripción", "inscripciones")}).
        </p>
      ) : (
        <p className="font-medium text-foreground">
          Todos los alumnos activos están inscriptos en sus módulos.
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Los módulos creados antes de que la inscripción fuera automática no
        inscribieron a nadie. Esta acción inscribe a cada alumno activo en los
        módulos que le faltan, sin cuotas ni vendedor.
      </p>

      {!abierto ? (
        <Button size="sm" className="mt-3" onClick={() => setAbierto(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Ver qué se va a inscribir
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Se van a crear {plural(resumen.inscripciones, "inscripción", "inscripciones")};{" "}
            {plural(preview.existentes, "ya existía", "ya existían")}.
          </p>

          {preview.aCrear.length > 0 ? (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border bg-card p-2 text-xs">
              {preview.aCrear.map((a) => (
                <li key={a.parentEnrollmentId}>
                  <span className="font-medium text-foreground">{a.contactName}</span>
                  <span className="text-muted-foreground"> — {a.modules.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {preview.excluidas.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-foreground">
                Se deja afuera ({preview.excluidas.length}):
              </p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {preview.excluidas.map((e, i) => (
                  <li key={`${e.parentEnrollmentId}-${e.moduleLabel ?? "todos"}-${i}`}>
                    {e.contactName}
                    {e.moduleLabel ? ` — ${e.moduleLabel}` : ""}: {e.detalle}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canEditEnrollments && falta ? (
              <Button size="sm" loading={guardando} onClick={() => void confirmar()}>
                {guardando ? "Inscribiendo…" : "Confirmar e inscribir"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cerrar
            </Button>
          </div>
          {!canEditEnrollments && falta ? (
            <p className="text-xs text-muted-foreground">
              Inscribir requiere el permiso de inscripciones.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
