"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { claseSugerida } from "@/lib/clonar-grupo";

type Pendiente = {
  id: string;
  title: string;
  url: string;
  originClassNumber: number | null;
  originClassLabel: string;
};

type Clase = { id: string; number: number; date: string; canceled: boolean };

function dia(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/**
 * 0088 — El material que vino de las CLASES del grupo en que se basó el alta.
 * El grupo nuevo nació sin clases, así que quedó como material del grupo con
 * su clase de origen; acá se asigna a mano, uno por uno, a una clase real. Se
 * sugiere la del mismo número, pero la persona confirma.
 *
 * Sin nada pendiente no se dibuja nada.
 */
export function MaterialPorAsignar({
  cohortId,
  clases,
  canEdit,
  onAsignado,
}: {
  cohortId: string;
  /** Las clases REALES del grupo (no la proyección). */
  clases: Clase[];
  /** `academico.editar`, igual que cargar o quitar material. */
  canEdit: boolean;
  /** Para que la pestaña vuelva a pedir el material de las clases. */
  onAsignado: () => void;
}) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [asignando, setAsignando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/material-por-asignar`).catch(() => null);
    if (!res?.ok) return;
    setPendientes(((await res.json()) as { resources: Pendiente[] }).resources);
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (pendientes.length === 0) return null;

  async function asignar(p: Pendiente, classSessionId: string) {
    setAsignando(p.id);
    const res = await fetch(`/api/resources/${p.id}/class`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classSessionId }),
    }).catch(() => null);
    setAsignando(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudo asignar el material a la clase.");
      return;
    }
    notify.success(`«${p.title}» quedó en la clase.`);
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    onAsignado();
  }

  return (
    <section className="space-y-2 rounded-md border p-3" aria-labelledby="material-por-asignar-titulo">
      <div>
        <h3 id="material-por-asignar-titulo" className="text-sm font-medium">
          Material de clases del grupo original
        </h3>
        <p className="text-xs text-muted-foreground">
          {clases.length === 0
            ? "Se copió como material del grupo. Cuando se genere el cronograma, vas a poder asignar cada uno a su clase."
            : "Se copió como material del grupo. Asigná cada uno a la clase que corresponda: te sugerimos la del mismo número."}
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {pendientes.map((p) => {
          const elegida = eleccion[p.id] ?? claseSugerida(p.originClassNumber, clases) ?? "";
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {p.title}
              </a>
              <Badge variant="secondary" title={p.originClassLabel}>
                {p.originClassNumber !== null
                  ? `De la clase ${p.originClassNumber} del grupo original`
                  : "De una clase del grupo original"}
              </Badge>
              <span className="text-xs text-muted-foreground">{p.originClassLabel}</span>
              {canEdit && clases.length > 0 ? (
                <span className="flex items-center gap-2">
                  <Select
                    aria-label={`Asignar «${p.title}» a una clase`}
                    value={elegida}
                    onChange={(e) => setEleccion((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="h-8 w-44"
                  >
                    <option value="">Asignar a clase…</option>
                    {clases.map((c) => (
                      <option key={c.id} value={c.id}>
                        Clase {c.number} · {dia(c.date)}
                        {c.canceled ? " (cancelada)" : ""}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!elegida}
                    loading={asignando === p.id}
                    onClick={() => void asignar(p, elegida)}
                  >
                    Asignar
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
