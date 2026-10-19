"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import {
  MAX_NUMERO,
  facturacionCsv,
  filtrarFacturacion,
  normalizarNumero,
  totalesPorMoneda,
  type EstadoFacturacion,
  type FilaFacturacion,
  type FiltrosFacturacion,
} from "@/lib/facturacion";

/**
 * 042 — Facturación: las ventas que faltan facturar, y las facturadas para
 * corregir.
 *
 * - Quién está en "Pendientes" lo decide el servidor con la MISMA regla que
 *   el correo de T-7/T-2 (`pendienteDeFacturar`): la pantalla y el correo no
 *   pueden discrepar.
 * - Los filtros se aplican acá con `filtrarFacturacion`, y el CSV exporta
 *   exactamente la lista filtrada que se ve.
 * - Un total por moneda y ningún total general (026).
 * - Anotar el número saca la fila de Pendientes AL INSTANTE (optimista); si
 *   el servidor dice que no, la fila vuelve a su lugar y se avisa.
 */

type Respuesta = { estado: EstadoFacturacion; filas: FilaFacturacion[] };

const SIMBOLO: Record<string, string> = { UYU: "$", PYG: "Gs. ", USD: "US$" };
const dinero = (n: number, c: string) => `${SIMBOLO[c] ?? `${c} `}${n.toLocaleString("es-UY")}`;
const dia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

const FILTROS_INICIALES: FiltrosFacturacion = {
  cohortId: null,
  desde: null,
  hasta: null,
  soloConfirmadas: false,
  empresa: "todas",
};

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function FacturacionClient({ puedeFacturar }: { puedeFacturar: boolean }) {
  const [estado, setEstado] = useState<EstadoFacturacion>("pendientes");
  const [filas, setFilas] = useState<FilaFacturacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFacturacion>(FILTROS_INICIALES);
  /** Lo que se está escribiendo en cada fila, por id de inscripción. */
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await fetch(`/api/facturacion?estado=${estado}`).catch(() => null);
    setCargando(false);
    if (!res?.ok) {
      setError("No pudimos cargar las ventas. Si al reintentar sigue igual, avisale a quien administra la instancia.");
      return;
    }
    const data = (await res.json()) as Respuesta;
    setFilas(data.filas);
    setBorradores({});
  }, [estado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cohortes = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const f of filas) {
      if (!vistas.has(f.cohortId)) vistas.set(f.cohortId, f.cohorte ? `${f.curso} — ${f.cohorte}` : f.curso);
    }
    return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [filas]);

  const visibles = useMemo(() => filtrarFacturacion(filas, filtros), [filas, filtros]);
  const totales = useMemo(() => totalesPorMoneda(visibles), [visibles]);

  function setFiltro<K extends keyof FiltrosFacturacion>(k: K, v: FiltrosFacturacion[K]) {
    setFiltros((f) => ({ ...f, [k]: v }));
  }

  async function guardar(fila: FilaFacturacion) {
    const numero = normalizarNumero(borradores[fila.enrollmentId] ?? fila.invoiceNumber ?? "");
    if (numero === fila.invoiceNumber) return;
    if (estado === "pendientes" && numero === null) return;

    // Optimista: en Pendientes, una fila con número se va; en Facturadas, una
    // fila a la que se le borra el número vuelve a Pendientes (se va de acá).
    const anterior = filas;
    const sale = (estado === "pendientes") === (numero !== null);
    setFilas((fs) =>
      sale
        ? fs.filter((f) => f.enrollmentId !== fila.enrollmentId)
        : fs.map((f) => (f.enrollmentId === fila.enrollmentId ? { ...f, invoiceNumber: numero } : f))
    );
    setGuardando((g) => ({ ...g, [fila.enrollmentId]: true }));

    const res = await fetch(`/api/enrollments/${fila.enrollmentId}/invoice`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceNumber: numero }),
    }).catch(() => null);
    setGuardando((g) => ({ ...g, [fila.enrollmentId]: false }));

    if (!res?.ok) {
      setFilas(anterior);
      notify.error(await mensajeDeError(res, "No se pudo guardar el número de factura. La venta quedó como estaba."));
      return;
    }
    const data = (await res.json()) as { aviso: string | null };
    setBorradores((b) => {
      const { [fila.enrollmentId]: _, ...resto } = b;
      return resto;
    });
    if (data.aviso) notify.warning(data.aviso);
    else if (numero === null) notify.success(`Se borró la factura de ${fila.alumno}: vuelve a Pendientes.`);
    else notify.success(`Factura ${numero} anotada para ${fila.alumno}.`);
  }

  function exportar() {
    const csv = facturacionCsv(visibles);
    // BOM: Excel abre el UTF-8 con tildes sin preguntar.
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturacion-${estado}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 p-6">
      <header className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Receipt className="h-5 w-5" />
            Facturación
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Las ventas que todavía no tienen número de factura. Es la misma lista que
            Administración recibe por correo 7 y 2 días antes del inicio de cada cohorte
            confirmada.
            {puedeFacturar
              ? " Anotá el número y la venta sale de la lista."
              : " Para anotar números hace falta el permiso de registrar facturas."}
          </p>
        </div>

        <div className="flex gap-2 border-b border-border">
          {(
            [
              { key: "pendientes", label: "Pendientes" },
              { key: "facturadas", label: "Facturadas" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={estado === t.key}
              className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                estado === t.key
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setEstado(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Cohorte
            <Select
              className="w-64"
              value={filtros.cohortId ?? ""}
              onChange={(e) => setFiltro("cohortId", e.target.value || null)}
              aria-label="Cohorte"
            >
              <option value="">Todas</option>
              {cohortes.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Inicio desde
            <Input
              type="date"
              className="w-40"
              value={filtros.desde ?? ""}
              onChange={(e) => setFiltro("desde", e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Inicio hasta
            <Input
              type="date"
              className="w-40"
              value={filtros.hasta ?? ""}
              onChange={(e) => setFiltro("hasta", e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Empresa
            <Select
              className="w-44"
              value={filtros.empresa}
              onChange={(e) => setFiltro("empresa", e.target.value as FiltrosFacturacion["empresa"])}
              aria-label="Empresa"
            >
              <option value="todas">Con y sin empresa</option>
              <option value="con">Solo con empresa</option>
              <option value="sin">Solo sin empresa</option>
            </Select>
          </label>
          <div className="pb-2">
            <CheckboxField
              label="Solo cohortes confirmadas"
              checked={filtros.soloConfirmadas}
              onChange={(e) => setFiltro("soloConfirmadas", e.target.checked)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={visibles.length === 0}
            onClick={exportar}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : visibles.length === 0 ? (
        <p className="rounded-md border border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {filas.length === 0
            ? estado === "pendientes"
              ? "No hay ventas pendientes de facturar."
              : "Todavía no hay ventas facturadas."
            : "Ninguna venta coincide con los filtros."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Curso y cohorte</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Factura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((f) => {
                  const borrador = borradores[f.enrollmentId] ?? f.invoiceNumber ?? "";
                  return (
                    <TableRow key={f.enrollmentId}>
                      <TableCell className="font-medium">
                        <Link href={`/contacts/${f.contactId}`} className="hover:underline">
                          {f.alumno}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span>{f.curso}</span>
                        {f.cohorte && <span className="block text-xs text-muted-foreground">{f.cohorte}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span>{dia(f.inicio)}</span>
                        <span className="mt-0.5 block">
                          {f.confirmada ? (
                            <Badge variant="success">Confirmada</Badge>
                          ) : (
                            <Badge variant="secondary">Sin confirmar</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{f.vendedor ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {f.amount === null ? (
                          <span className="text-muted-foreground">Sin monto</span>
                        ) : (
                          dinero(f.amount, f.currency)
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {f.empresa ? (
                          <>
                            <span className="block text-sm">{f.empresa.razonSocial}</span>
                            {f.empresa.rut && <span className="block text-muted-foreground">RUT {f.empresa.rut}</span>}
                            {f.empresa.billingEmail && (
                              <span className="block text-muted-foreground">{f.empresa.billingEmail}</span>
                            )}
                            {f.empresa.condicion && (
                              <span className="block text-muted-foreground">{f.empresa.condicion}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Particular</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {puedeFacturar ? (
                          <form
                            className="flex items-center gap-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void guardar(f);
                            }}
                          >
                            <Input
                              className="h-8 w-32"
                              maxLength={MAX_NUMERO}
                              placeholder="N.º de factura"
                              aria-label={`Número de factura de ${f.alumno}`}
                              value={borrador}
                              onChange={(e) =>
                                setBorradores((b) => ({ ...b, [f.enrollmentId]: e.target.value }))
                              }
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              disabled={
                                guardando[f.enrollmentId] ||
                                normalizarNumero(borrador) === f.invoiceNumber ||
                                (estado === "pendientes" && normalizarNumero(borrador) === null)
                              }
                            >
                              {estado === "pendientes" ? "Registrar factura" : "Corregir"}
                            </Button>
                          </form>
                        ) : (
                          (f.invoiceNumber ?? <span className="text-muted-foreground">—</span>)
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <footer className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {visibles.length} {visibles.length === 1 ? "venta" : "ventas"}
            </span>
            {totales.totales.map((t) => (
              <span key={t.currency} className="tabular-nums">
                Total {t.currency}: <strong>{dinero(t.total, t.currency)}</strong>
                <span className="text-muted-foreground"> ({t.cantidad})</span>
              </span>
            ))}
            {totales.sinMonto > 0 && (
              <span className="text-muted-foreground">
                {totales.sinMonto} sin monto pactado
              </span>
            )}
          </footer>
          {estado === "facturadas" && puedeFacturar && (
            <p className="text-xs text-muted-foreground">
              Para borrar un número cargado por error, vaciá el campo y tocá «Corregir»: la venta vuelve a
              Pendientes.
            </p>
          )}
        </>
      )}
    </div>
  );
}
