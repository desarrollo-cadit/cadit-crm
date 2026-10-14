"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Template } from "@/lib/grading-template";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * 031 (T034, DV-012) — La bandeja de aprobación.
 *
 * Lista lo que espera aprobación (filtrable por cohorte) y, al elegir una,
 * muestra la corrección COMPLETA —ejercicios, campos, devolución, la vigente
 * para comparar y la entrega— con las dos salidas: aprobar o devolver con un
 * comentario. No se edita desde acá: quien aprueba decide sobre lo que mandó
 * el corrector; si hay que cambiar algo, se devuelve con el porqué.
 *
 * Los permisos los decide la página y las rutas (`correcciones.aprobar`); este
 * componente solo dibuja.
 */

type Item = {
  id: string;
  assessmentName: string;
  cohortId: string;
  cohortName: string;
  studentName: string;
  correctedByName: string | null;
  submittedAt: string | null;
  score: number | null;
  passed: boolean | null;
};

type Version = {
  id: string;
  status: string;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  criterionScores: { criterionId: string; points: number | null; comment: string | null }[];
  textValues: { fieldId: string; value: string }[];
  correctedByName: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
};

type Detalle = {
  correction: Version;
  template: Template;
  assessmentName: string;
  studentName: string;
  cohortName: string;
  published: Version | null;
  submission: { url: string; title: string | null } | null;
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" }) : "";

function Resultado({ v }: { v: Pick<Version, "score" | "passed"> }) {
  return (
    <span className="inline-flex items-center gap-2">
      {v.score !== null && <span className="font-semibold">{v.score}/100</span>}
      {v.passed !== null && (
        <Badge variant={v.passed ? "success" : "destructive"}>
          {v.passed ? "Aprobada" : "No aprobada"}
        </Badge>
      )}
    </span>
  );
}

/** Mensaje del servidor si lo hay; si no, uno genérico. */
async function mensaje(res: Response | null, otro: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? otro;
}

export function CorrectionInbox() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [fallo, setFallo] = useState(false);
  /** Las cohortes del filtro salen de la lista SIN filtrar: filtrar no las borra. */
  const [cohortes, setCohortes] = useState<{ id: string; name: string }[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const qs = cohortId ? `?status=pending&cohortId=${encodeURIComponent(cohortId)}` : "?status=pending";
    const res = await fetch(`/api/corrections${qs}`).catch(() => null);
    if (!res?.ok) {
      // "No pude traerla" no se dibuja como "no hay nada pendiente".
      setFallo(true);
      return;
    }
    const data = (await res.json()) as { items: Item[] };
    setFallo(false);
    setItems(data.items);
    if (!cohortId) {
      const vistas = new Map(data.items.map((i) => [i.cohortId, i.cohortName]));
      setCohortes([...vistas].map(([id, name]) => ({ id, name })));
    }
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function resuelta() {
    setElegida(null);
    void cargar();
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="space-y-3 border-b px-4 pb-3 pt-4 md:px-6">
        <Breadcrumb items={[{ label: "Gestión", href: null }, { label: "Correcciones", href: null }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ClipboardCheck className="h-5 w-5" aria-hidden /> Correcciones
              {items && (
                <span className="text-sm font-normal text-muted-foreground">
                  {items.length} {items.length === 1 ? "pendiente" : "pendientes"}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Las correcciones que esperan tu aprobación. El alumno no ve nada hasta que la
              aprobás; si algo no está bien, devolvela con un comentario.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Cohorte
            <Select
              className="h-9 w-56"
              value={cohortId}
              onChange={(e) => {
                setCohortId(e.target.value);
                setElegida(null);
              }}
            >
              <option value="">Todas</option>
              {cohortes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:px-6">
        <section aria-label="Pendientes" className="min-w-0 space-y-2">
          {fallo && !items ? (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-sm text-danger">No se pudo cargar la bandeja.</p>
              <Button size="sm" variant="outline" onClick={() => void cargar()}>
                Reintentar
              </Button>
            </div>
          ) : !items ? (
            <Skeleton className="h-32 w-full" />
          ) : items.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No hay correcciones esperando aprobación.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    data-correction-id={i.id}
                    onClick={() => setElegida(i.id)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors hover:bg-muted",
                      elegida === i.id && "border-brand bg-muted"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{i.studentName}</span>
                      <Resultado v={i} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i.assessmentName} · {i.cohortName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.correctedByName ? `Corrigió ${i.correctedByName}` : "Sin corrector"}
                      {i.submittedAt && ` · enviada el ${fecha(i.submittedAt)}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Detalle" className="min-w-0">
          {elegida ? (
            <DetalleDeCorreccion key={elegida} id={elegida} onResuelta={resuelta} />
          ) : (
            items &&
            items.length > 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Elegí una corrección para revisarla.
              </p>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function DetalleDeCorreccion({ id, onResuelta }: { id: string; onResuelta: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [fallo, setFallo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/corrections/${encodeURIComponent(id)}`).catch(() => null);
    if (!res?.ok) {
      setFallo(true);
      return;
    }
    setFallo(false);
    setD((await res.json()) as Detalle);
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aprobar() {
    setOcupado(true);
    const res = await fetch(`/api/corrections/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    }).catch(() => null);
    setOcupado(false);
    if (!res?.ok) {
      notify.error(await mensaje(res, "No se pudo aprobar la corrección."));
      return;
    }
    notify.success("Corrección aprobada y publicada.");
    onResuelta();
  }

  async function devolver() {
    if (!comentario.trim()) {
      notify.error("Escribí por qué la devolvés.");
      return;
    }
    setOcupado(true);
    const res = await fetch(`/api/corrections/${encodeURIComponent(id)}/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: comentario }),
    }).catch(() => null);
    setOcupado(false);
    if (!res?.ok) {
      notify.error(await mensaje(res, "No se pudo devolver la corrección."));
      return;
    }
    notify.success("Corrección devuelta a quien la corrigió.");
    onResuelta();
  }

  if (fallo && !d) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <p className="text-sm text-danger">No se pudo cargar la corrección.</p>
        <Button size="sm" variant="outline" onClick={() => void cargar()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!d) return <Skeleton className="h-48 w-full" />;

  const { correction: c, template: t } = d;
  const pendiente = c.status === "pending";

  return (
    <article className="space-y-4 rounded-lg border bg-card p-4" data-correction-detail={c.id}>
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{d.studentName}</h2>
        <p className="text-sm text-muted-foreground">
          {d.assessmentName} · {d.cohortName}
        </p>
        <p className="text-sm">
          <Resultado v={c} />
          {t.scale === "numeric" && t.minScore !== null && (
            <span className="ml-2 text-xs text-muted-foreground">aprueba con {t.minScore}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {c.correctedByName ? `Corrigió ${c.correctedByName}` : "Sin corrector"}
          {c.submittedAt && ` · enviada el ${fecha(c.submittedAt)}`}
        </p>
      </header>

      {d.submission ? (
        <a
          href={d.submission.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {d.submission.title ?? "Ver la entrega"}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Corregida sin entrega.</p>
      )}

      {t.criteria.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Ejercicios</h3>
          <ul className="space-y-1.5">
            {t.criteria.map((cr) => {
              const s = c.criterionScores.find((x) => x.criterionId === cr.id);
              return (
                <li key={cr.id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span>{cr.name}</span>
                    <span className="font-medium">
                      {s?.points ?? "—"}/{cr.maxPoints}
                    </span>
                  </div>
                  {s?.comment && (
                    <p className="whitespace-pre-line text-xs text-muted-foreground">{s.comment}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {t.textFields.map((f) => {
        const v = c.textValues.find((x) => x.fieldId === f.id)?.value;
        return (
          <section key={f.id} className="space-y-1">
            <h3 className="text-sm font-medium">{f.name}</h3>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{v?.trim() || "—"}</p>
          </section>
        );
      })}

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Devolución</h3>
        <p className="whitespace-pre-line text-sm text-muted-foreground">{c.feedback ?? "—"}</p>
      </section>

      {d.published && (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          Hoy está vigente otra versión: {d.published.score !== null ? `${d.published.score}/100 · ` : ""}
          {d.published.passed ? "aprobada" : "no aprobada"}
          {d.published.publishedAt && `, publicada el ${fecha(d.published.publishedAt)}`}. Si
          aprobás esta, la reemplaza.
        </p>
      )}

      {pendiente ? (
        <footer className="space-y-2 border-t pt-3">
          {devolviendo ? (
            <>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Por qué la devolvés (lo lee quien corrigió, no el alumno)
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void devolver()} disabled={ocupado}>
                  Devolver con comentario
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDevolviendo(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void aprobar()} disabled={ocupado}>
                Aprobar y publicar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDevolviendo(true)}>
                Devolver
              </Button>
            </div>
          )}
        </footer>
      ) : (
        <p className="text-xs text-muted-foreground">Esta corrección ya no está esperando aprobación.</p>
      )}
    </article>
  );
}
