"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { CompanyDto } from "@/lib/types";
import { normalizarRut } from "@/lib/company";
import {
  lineasDeConteosDeEmpresas,
  type VistaPreviaDeUnificacionDeEmpresas,
} from "@/lib/company-merge";
import { coincideConBusqueda } from "@/lib/contact-search";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const MAX_RESULTADOS = 8;

/**
 * 2026-10-29 — "Unificar empresas": elegir la duplicada, ver la vista previa
 * (cómo queda cada dato, qué se mueve y qué bloquea) y recién ahí confirmar.
 * Es IRREVERSIBLE: la absorbida se borra. El servidor vuelve a validar todo
 * al confirmar (`POST /api/companies/[id]/merge`, donde `[id]` es la que
 * QUEDA). Por defecto queda la empresa desde la que se abrió; «Que quede la
 * otra» invierte el pedido.
 *
 * La búsqueda es en memoria sobre la lista que la pantalla ya cargó
 * (`GET /api/companies`), con la MISMA regla que contactos
 * (`coincideConBusqueda`): razón social, nombre comercial y RUT (también
 * escrito sin puntos ni guiones).
 */
export function MergeCompaniesDialog({
  company,
  companies,
  onClose,
  onMerged,
}: {
  company: CompanyDto;
  companies: CompanyDto[];
  onClose: () => void;
  /** Después de unificar: el id de la que quedó. */
  onMerged: (keptId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [otroId, setOtroId] = useState<string | null>(null);
  const [keptId, setKeptId] = useState(company.id);
  const [preview, setPreview] = useState<VistaPreviaDeUnificacionDeEmpresas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [unificando, setUnificando] = useState(false);

  const absorbidaId = otroId === null ? null : keptId === company.id ? otroId : company.id;

  const resultados = useMemo(() => {
    const otras = companies.filter((c) => c.id !== company.id);
    if (!q.trim()) return otras.slice(0, MAX_RESULTADOS);
    return otras
      .filter((c) =>
        coincideConBusqueda(q, {
          texto: [c.legalName, c.tradeName, c.taxId, c.taxId ? normalizarRut(c.taxId) : null],
          telefono: null,
        })
      )
      .slice(0, MAX_RESULTADOS);
  }, [companies, company.id, q]);

  useEffect(() => {
    if (!absorbidaId) {
      setPreview(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    void (async () => {
      const res = await fetch(
        `/api/companies/${encodeURIComponent(keptId)}/merge-preview?${new URLSearchParams({ with: absorbidaId })}`
      ).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | { preview?: VistaPreviaDeUnificacionDeEmpresas; error?: { message?: string } }
        | null;
      if (cancelado) return;
      setCargando(false);
      if (!res?.ok || !data?.preview) {
        setPreview(null);
        setError(data?.error?.message ?? "No se pudo armar la vista previa.");
        return;
      }
      setPreview(data.preview);
    })();
    return () => {
      cancelado = true;
    };
  }, [keptId, absorbidaId]);

  async function unificar() {
    if (!preview) return;
    setUnificando(true);
    const res = await fetch(`/api/companies/${encodeURIComponent(preview.queda.id)}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ absorbedId: preview.absorbida.id, confirm: true }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { keptId?: string; error?: { message?: string } }
      | null;
    setUnificando(false);
    if (!res?.ok || !data?.keptId) {
      setError(data?.error?.message ?? "No se pudo unificar. No se cambió nada.");
      return;
    }
    notify.success(`Se unificó con ${preview.absorbida.legalName}.`);
    onMerged(data.keptId);
  }

  const lineas = preview ? lineasDeConteosDeEmpresas(preview.conteos) : [];
  const otra = companies.find((c) => c.id === otroId);
  const bloqueado = !preview || preview.bloqueos.length > 0;

  return (
    <Modal
      onClose={onClose}
      busy={unificando}
      labelledBy="merge-companies-title"
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <h3 id="merge-companies-title" className="mb-1 font-semibold">
        Unificar empresas
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Juntá dos empresas que son la misma. Sus contactos, inscripciones, accesos a cursos offline y
        cursadas históricas pasan a la que queda.
      </p>

      {!otroId ? (
        <div className="space-y-2">
          <label htmlFor="merge-company-search" className="text-sm font-medium">
            ¿Con qué empresa la unificás?
          </label>
          <Input
            id="merge-company-search"
            type="search"
            autoFocus
            placeholder="Razón social, nombre comercial o RUT"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay otra empresa que coincida.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-sm hover:bg-subtle"
                    onClick={() => {
                      setError(null);
                      setKeptId(company.id);
                      setOtroId(c.id);
                    }}
                  >
                    <span className="font-medium">{c.legalName}</span>
                    {c.tradeName && <span className="text-muted-foreground">{c.tradeName}</span>}
                    {c.taxId && <span className="text-xs text-muted-foreground">RUT {c.taxId}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Unificar con <span className="font-medium text-foreground">{otra?.legalName ?? "…"}</span>
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => {
              setOtroId(null);
              setKeptId(company.id);
              setPreview(null);
            }}
          >
            Elegir otra
          </button>
        </div>
      )}

      {cargando && !preview && <p className="text-sm text-muted-foreground">Armando la vista previa…</p>}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EmpresaCard titulo="Queda esta empresa" empresa={preview.queda} />
            <EmpresaCard titulo="Se absorbe (se borra)" empresa={preview.absorbida} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setKeptId(preview.absorbida.id)}
            disabled={cargando || unificando}
          >
            <ArrowLeftRight className="mr-1.5 h-4 w-4" aria-hidden />
            Que quede {preview.absorbida.legalName}
          </Button>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Dato</th>
                  <th className="px-3 py-2 font-medium">Queda</th>
                  <th className="px-3 py-2 font-medium">Se absorbe</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.campos.map((c) => (
                  <tr key={c.campo} className="border-t align-top">
                    <td className="px-3 py-2 font-medium">{c.etiqueta}</td>
                    <td className="whitespace-pre-line px-3 py-2 text-muted-foreground">{c.queda ?? "—"}</td>
                    <td className="whitespace-pre-line px-3 py-2 text-muted-foreground">{c.absorbido ?? "—"}</td>
                    <td className="whitespace-pre-line px-3 py-2">{c.resultado ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm">
            <p className="font-medium">Se van a mover a la que queda:</p>
            {lineas.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {lineas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nada más que sus datos.</p>
            )}
          </div>

          {preview.bloqueos.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              {preview.bloqueos.map((b) => (
                <p key={b.code}>{b.mensaje}</p>
              ))}
            </div>
          )}

          <p className="text-sm font-medium">Esta acción no se puede deshacer.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={unificando}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={bloqueado || cargando || unificando}
          onClick={() => void unificar()}
        >
          {unificando ? "Unificando…" : "Unificar"}
        </Button>
      </div>
    </Modal>
  );
}

function EmpresaCard({
  titulo,
  empresa,
}: {
  titulo: string;
  empresa: VistaPreviaDeUnificacionDeEmpresas["queda"];
}) {
  return (
    <div className="space-y-1 rounded-md border px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold">{empresa.legalName}</p>
      <p className="text-xs text-muted-foreground">{empresa.taxId ? `RUT ${empresa.taxId}` : "Sin RUT"}</p>
    </div>
  );
}
