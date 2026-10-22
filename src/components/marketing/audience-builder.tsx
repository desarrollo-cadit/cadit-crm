"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { MARKETING_RECIPIENT_CAP, type AudienceFilters, type ExclusionCounts } from "@/lib/marketing/audience";
import type { AudienceDto, AudiencePreviewDto, OpcionesDeFiltros } from "@/server/marketing/audiences";

/**
 * 045 (US1; FR-001…FR-005, FR-018, SC-001) — Armar una audiencia y ver al
 * instante a quién le llegaría: cantidad, excluidos por motivo y la lista.
 *
 * La cuenta la hace SIEMPRE el servidor (`/preview`), con la misma función que
 * arma los destinatarios al enviar: lo que se ve acá es lo que se enviaría.
 */

type Opcion = { value: string; label: string; hint?: string };

type ClaveLista = "sources" | "stageIds" | "cohortIds" | "courseIds" | "interestCourseIds" | "companyIds";

const ESPERA_MS = 350;

const MOTIVOS: { key: keyof ExclusionCounts; label: string }[] = [
  { key: "baja", label: "dado de baja" },
  { key: "sin_correo", label: "sin correo" },
  { key: "archivado", label: "archivado" },
  { key: "prueba", label: "de prueba" },
  { key: "duplicado", label: "duplicado" },
];

const ETAPA: Record<"open" | "won" | "lost", string> = { open: "", won: "ganado", lost: "perdido" };

function FiltroMultiple({
  label,
  opciones,
  seleccion,
  onChange,
  disabled,
}: {
  label: string;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? opciones.filter((o) => o.label.toLowerCase().includes(q)) : opciones;
  }, [busqueda, opciones]);
  const toggle = (v: string) =>
    onChange(seleccion.includes(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);

  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {seleccion.length === 0 ? "Cualquiera" : `${seleccion.length} elegidos`}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="space-y-2 border-t px-3 py-2">
        {opciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay opciones todavía.</p>
        ) : (
          <>
            {opciones.length > 8 && (
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                aria-label={`Buscar en ${label}`}
                className="h-8"
              />
            )}
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {visibles.map((o) => (
                <li key={o.value}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={seleccion.includes(o.value)}
                      onChange={() => toggle(o.value)}
                      disabled={disabled}
                    />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                  </label>
                </li>
              ))}
            </ul>
            {seleccion.length > 0 && !disabled && (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange([])}>
                Quitar este filtro
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}

export function AudienceBuilder({
  initial,
  canEdit,
}: {
  /** `null` = audiencia nueva. */
  initial: AudienceDto | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [filters, setFilters] = useState<AudienceFilters>(initial?.filters ?? { v: 1 });
  const [opciones, setOpciones] = useState<OpcionesDeFiltros | null>(null);
  const [preview, setPreview] = useState<AudiencePreviewDto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    fetch("/api/marketing/audiences/options")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((o: OpcionesDeFiltros) => setOpciones(o))
      .catch(() => setError("No se pudieron cargar los filtros."));
  }, []);

  const evaluar = useCallback(async (f: AudienceFilters, p: number) => {
    const n = ++pedido.current;
    setCargando(true);
    try {
      const res = await fetch("/api/marketing/audiences/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters: f, page: p, pageSize: 25 }),
      });
      const data = await res.json().catch(() => null);
      if (n !== pedido.current) return; // llegó una respuesta vieja
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo calcular la audiencia.");
        return;
      }
      setError(null);
      setPreview(data as AudiencePreviewDto);
    } catch {
      if (n === pedido.current) setError("No se pudo calcular la audiencia.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, []);

  // Espera breve tras cada cambio: no se recalcula en cada tilde.
  useEffect(() => {
    const t = setTimeout(() => void evaluar(filters, page), ESPERA_MS);
    return () => clearTimeout(t);
  }, [filters, page, evaluar]);

  const setLista = (clave: ClaveLista, valores: string[]) => {
    setPage(1);
    setFilters((f) => {
      const next = { ...f };
      if (valores.length === 0) delete next[clave];
      else next[clave] = valores;
      return next;
    });
  };

  const setFecha = (clave: "createdFrom" | "createdTo", valor: string) => {
    setPage(1);
    setFilters((f) => {
      const next = { ...f };
      if (!valor) delete next[clave];
      else next[clave] = valor;
      return next;
    });
  };

  async function guardar() {
    if (!name.trim()) {
      notify.error("Poné un nombre para guardar la audiencia.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(initial ? `/api/marketing/audiences/${initial.id}` : "/api/marketing/audiences", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filters }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify.error(data?.error?.message ?? "No se pudo guardar la audiencia.");
        return;
      }
      notify.success("Audiencia guardada.");
      if (!initial) router.replace(`/marketing/audiencias/${(data as AudienceDto).id}`);
      else router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!initial) return;
    if (!window.confirm(`¿Borrar la audiencia «${initial.name}»? Las campañas que la usaban conservan sus filtros.`)) {
      return;
    }
    const res = await fetch(`/api/marketing/audiences/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      notify.error(data?.error?.message ?? "No se pudo borrar la audiencia.");
      return;
    }
    notify.success("Audiencia borrada.");
    router.push("/marketing?tab=audiencias");
  }

  const totalExcluidos = preview
    ? Object.values(preview.excluded).reduce((a, b) => a + b, 0)
    : 0;
  const paginas = preview ? Math.max(1, Math.ceil(preview.count / preview.pageSize)) : 1;
  const disabled = !canEdit;

  const op = opciones;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="space-y-3" aria-label="Filtros">
        <div className="space-y-1">
          <Label htmlFor="audience-name">Nombre</Label>
          <Input
            id="audience-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Perdidos del formulario de Revit"
            maxLength={120}
            disabled={disabled}
          />
        </div>

        {!op ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <FiltroMultiple
              label="Origen"
              opciones={op.sources.map((s) => ({ value: s.value, label: s.label, hint: String(s.count) }))}
              seleccion={filters.sources ?? []}
              onChange={(v) => setLista("sources", v)}
              disabled={disabled}
            />
            <FiltroMultiple
              label="Etapa del pipeline"
              opciones={op.stages.map((s) => ({ value: s.id, label: s.name, hint: ETAPA[s.kind] }))}
              seleccion={filters.stageIds ?? []}
              onChange={(v) => setLista("stageIds", v)}
              disabled={disabled}
            />
            <FiltroMultiple
              label="Grupo"
              opciones={op.cohorts.map((c) => ({ value: c.id, label: c.name, hint: c.startDate ?? undefined }))}
              seleccion={filters.cohortIds ?? []}
              onChange={(v) => setLista("cohortIds", v)}
              disabled={disabled}
            />
            <FiltroMultiple
              label="Curso de sus grupos"
              opciones={op.courses.map((c) => ({ value: c.id, label: c.name }))}
              seleccion={filters.courseIds ?? []}
              onChange={(v) => setLista("courseIds", v)}
              disabled={disabled}
            />
            <FiltroMultiple
              label="Curso de interés"
              opciones={op.courses.map((c) => ({ value: c.id, label: c.name }))}
              seleccion={filters.interestCourseIds ?? []}
              onChange={(v) => setLista("interestCourseIds", v)}
              disabled={disabled}
            />
            <FiltroMultiple
              label="Empresa"
              opciones={op.companies.map((c) => ({ value: c.id, label: c.name }))}
              seleccion={filters.companyIds ?? []}
              onChange={(v) => setLista("companyIds", v)}
              disabled={disabled}
            />
            <fieldset className="rounded-md border bg-card px-3 py-2">
              <legend className="px-1 text-sm font-medium">Fecha de alta</legend>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="created-from" className="text-xs">Desde</Label>
                  <Input
                    id="created-from"
                    type="date"
                    value={filters.createdFrom ?? ""}
                    onChange={(e) => setFecha("createdFrom", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="created-to" className="text-xs">Hasta</Label>
                  <Input
                    id="created-to"
                    type="date"
                    value={filters.createdTo ?? ""}
                    onChange={(e) => setFecha("createdTo", e.target.value)}
                    disabled={disabled}
                  />
                </div>
              </div>
            </fieldset>
          </>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={guardar} loading={guardando}>
              {initial ? "Guardar cambios" : "Guardar audiencia"}
            </Button>
            {initial && (
              <Button variant="outline" onClick={borrar}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Borrar
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-3" aria-label="A quién le llegaría" aria-busy={cargando}>
        <div className="rounded-md border bg-card px-4 py-3">
          <p className="flex items-center gap-2 text-2xl font-semibold" aria-live="polite">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
            {preview ? `${preview.count} ${preview.count === 1 ? "persona" : "personas"}` : "…"}
          </p>
          {preview && totalExcluidos > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {totalExcluidos} {totalExcluidos === 1 ? "excluido" : "excluidos"}:{" "}
              {MOTIVOS.filter((m) => preview.excluded[m.key] > 0)
                .map((m) => `${preview.excluded[m.key]} ${m.label}`)
                .join(", ")}
              .
            </p>
          )}
          {preview?.overCap && (
            <p className="mt-2 flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Supera el tope de {MARKETING_RECIPIENT_CAP} personas por campaña. Acotá los filtros para poder enviarle.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Correo</th>
              </tr>
            </thead>
            <tbody>
              {preview?.recipients.map((r) => (
                <tr key={r.contactId} className="border-t">
                  <td className="truncate px-3 py-2">{r.name}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground">{r.email}</td>
                </tr>
              ))}
              {preview && preview.recipients.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                    Nadie cumple estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {preview && paginas > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-muted-foreground">
              Página {page} de {paginas}
            </span>
            <Button variant="outline" size="sm" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
