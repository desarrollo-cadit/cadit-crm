"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount } from "@/lib/money";
import { notify } from "@/lib/notify";
import type { PestanaFacturacion } from "@/lib/pestanas";
import { usePestanaEnUrl } from "@/components/use-pestana-en-url";
import {
  Buscador,
  Desplegable,
  OpcionUnica,
  RangoDeFechas,
  Resaltado,
  ResumenDeFiltros,
  Segmentado,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import {
  MAX_NUMERO,
  contadoresDeFacturacion,
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

/** Centésimos → "$5.245,32" (`src/lib/money.ts`). */
const dinero = (n: number, c: string) => formatAmount(n, c);
const dia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

const ETIQUETA_DE_EMPRESA: Record<FiltrosFacturacion["empresa"], string> = {
  todas: "Con y sin",
  con: "Con empresa",
  sin: "Sin empresa",
};
const OPCION_DE_EMPRESA: Record<FiltrosFacturacion["empresa"], string> = {
  todas: "Con y sin empresa",
  con: "Solo con empresa",
  sin: "Solo sin empresa",
};

const FILTROS_INICIALES: FiltrosFacturacion = {
  cohortId: null,
  desde: null,
  hasta: null,
  soloConfirmadas: false,
  empresa: "todas",
  busqueda: "",
};

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function FacturacionClient({
  puedeFacturar,
  initialTab = "pendientes",
  initialCohortId = null,
}: {
  puedeFacturar: boolean;
  /** 2026-10-26 — De `?tab=pendientes|facturadas`, validada por el servidor. */
  initialTab?: PestanaFacturacion;
  /** 2026-10-26 — De `?grupo=<id>`: abre filtrada por ese grupo. */
  initialCohortId?: string | null;
}) {
  const [estado, setEstado] = usePestanaEnUrl<EstadoFacturacion>(initialTab);
  const [filas, setFilas] = useState<FilaFacturacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFacturacion>({
    ...FILTROS_INICIALES,
    cohortId: initialCohortId,
  });
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
  const contadores = useMemo(() => contadoresDeFacturacion(filas, filtros), [filas, filtros]);
  const nombreDeGrupo = filtros.cohortId
    ? (cohortes.find(([id]) => id === filtros.cohortId)?.[1] ?? "Otro grupo")
    : null;
  const busqueda = filtros.busqueda ?? "";
  const filtrosActivos: FiltroActivo[] = [
    ...(busqueda.trim()
      ? [{ clave: "q", etiqueta: `“${busqueda.trim()}”`, quitar: () => setFiltro("busqueda", "") }]
      : []),
    ...(nombreDeGrupo
      ? [{ clave: "grupo", etiqueta: `Grupo: ${nombreDeGrupo}`, quitar: () => setFiltro("cohortId", null) }]
      : []),
    ...(filtros.empresa !== "todas"
      ? [{ clave: "empresa", etiqueta: OPCION_DE_EMPRESA[filtros.empresa], quitar: () => setFiltro("empresa", "todas") }]
      : []),
    ...(filtros.soloConfirmadas
      ? [{ clave: "confirmadas", etiqueta: "Solo grupos confirmados", quitar: () => setFiltro("soloConfirmadas", false) }]
      : []),
    ...(filtros.desde || filtros.hasta
      ? [
          {
            clave: "fechas",
            etiqueta: [
              filtros.desde ? `Inicio desde ${dia(filtros.desde)}` : null,
              filtros.hasta ? `${filtros.desde ? "hasta" : "Inicio hasta"} ${dia(filtros.hasta)}` : null,
            ]
              .filter(Boolean)
              .join(" "),
            quitar: () => setFiltros((f) => ({ ...f, desde: null, hasta: null })),
          },
        ]
      : []),
  ];
  function limpiarFiltros() {
    setFiltros(FILTROS_INICIALES);
  }

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
            Administración recibe por correo 7 y 2 días antes del inicio de cada grupo
            confirmado.
            {puedeFacturar
              ? " Anotá el número y la venta sale de la lista."
              : " Para anotar números hace falta el permiso de registrar facturas."}
          </p>
        </div>

        {/* 2026-10-30 — Las pestañas siguen en la URL (`?tab=`); se ven como control segmentado. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmentado<EstadoFacturacion>
            etiqueta="Ventas"
            opciones={[
              { clave: "pendientes", etiqueta: "Pendientes" },
              { clave: "facturadas", etiqueta: "Facturadas" },
            ]}
            encendida={(k) => estado === k}
            onElegir={setEstado}
          />
          <Button variant="outline" size="sm" disabled={visibles.length === 0} onClick={exportar}>
            <Download className="mr-1.5 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <TarjetaDeFiltros
          pie={
            <ResumenDeFiltros
              mostrando={visibles.length}
              total={filas.length}
              sustantivo={{ uno: "venta", varios: "ventas" }}
              activos={filtrosActivos}
              onLimpiar={limpiarFiltros}
            />
          }
        >
          <Buscador
            value={filtros.busqueda ?? ""}
            onChange={(v) => setFiltro("busqueda", v)}
            placeholder="Buscar por alumno, curso, vendedor, empresa o factura…"
          />
          <Desplegable etiqueta="Grupo" valor={nombreDeGrupo ?? "Todos"} activo={filtros.cohortId !== null}>
            {(cerrar) => (
              <>
                <OpcionUnica
                  elegida={filtros.cohortId === null}
                  cantidad={contadores.todosLosGrupos}
                  onElegir={() => {
                    setFiltro("cohortId", null);
                    cerrar();
                  }}
                >
                  Todos los grupos
                </OpcionUnica>
                {cohortes.map(([id, nombre]) => (
                  <OpcionUnica
                    key={id}
                    elegida={filtros.cohortId === id}
                    cantidad={contadores.grupos.get(id) ?? 0}
                    onElegir={() => {
                      setFiltro("cohortId", id);
                      cerrar();
                    }}
                  >
                    {nombre}
                  </OpcionUnica>
                ))}
              </>
            )}
          </Desplegable>
          <Desplegable
            etiqueta="Empresa"
            valor={ETIQUETA_DE_EMPRESA[filtros.empresa]}
            activo={filtros.empresa !== "todas"}
          >
            {(cerrar) => (
              <>
                {(["todas", "con", "sin"] as const).map((k) => (
                  <OpcionUnica
                    key={k}
                    elegida={filtros.empresa === k}
                    cantidad={contadores.empresa[k]}
                    onElegir={() => {
                      setFiltro("empresa", k);
                      cerrar();
                    }}
                  >
                    {OPCION_DE_EMPRESA[k]}
                  </OpcionUnica>
                ))}
              </>
            )}
          </Desplegable>
          <Desplegable
            etiqueta="Grupos"
            valor={filtros.soloConfirmadas ? "Solo confirmados" : "Todos"}
            activo={filtros.soloConfirmadas}
          >
            {(cerrar) => (
              <>
                <OpcionUnica
                  elegida={!filtros.soloConfirmadas}
                  cantidad={contadores.confirmacion.todas}
                  onElegir={() => {
                    setFiltro("soloConfirmadas", false);
                    cerrar();
                  }}
                >
                  Confirmados y sin confirmar
                </OpcionUnica>
                <OpcionUnica
                  elegida={filtros.soloConfirmadas}
                  cantidad={contadores.confirmacion.soloConfirmadas}
                  onElegir={() => {
                    setFiltro("soloConfirmadas", true);
                    cerrar();
                  }}
                >
                  Solo grupos confirmados
                </OpcionUnica>
              </>
            )}
          </Desplegable>
          <RangoDeFechas
            etiqueta="Inicio desde"
            desde={filtros.desde ?? ""}
            hasta={filtros.hasta ?? ""}
            onDesde={(v) => setFiltro("desde", v || null)}
            onHasta={(v) => setFiltro("hasta", v || null)}
          />
        </TarjetaDeFiltros>
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
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
          {estado === "pendientes" ? "No hay ventas pendientes de facturar." : "Todavía no hay ventas facturadas."}
        </p>
      ) : visibles.length === 0 ? (
        <SinCoincidencias mensaje="Ninguna venta coincide con la búsqueda y los filtros." onLimpiar={limpiarFiltros} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Alumno</TableHead>
                  <TableHead>Curso y grupo</TableHead>
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
                    <TableRow key={f.enrollmentId} className="hover:bg-subtle">
                      <TableCell className="font-medium">
                        <Link href={`/contacts/${f.contactId}`} className="hover:underline">
                          <Resaltado texto={f.alumno} busqueda={busqueda} />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span>
                          <Resaltado texto={f.curso} busqueda={busqueda} />
                        </span>
                        {f.cohorte && (
                          <span className="block text-xs text-muted-foreground">
                            <Resaltado texto={f.cohorte} busqueda={busqueda} />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span>{dia(f.inicio)}</span>
                        <span className="mt-0.5 block">
                          {f.confirmada ? (
                            <Badge variant="success">Confirmado</Badge>
                          ) : (
                            <Badge variant="secondary">Sin confirmar</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {f.vendedor ? (
                          <Resaltado texto={f.vendedor} busqueda={busqueda} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
                            <span className="block text-sm">
                              <Resaltado texto={f.empresa.razonSocial} busqueda={busqueda} />
                            </span>
                            {f.empresa.rut && (
                              <span className="block text-muted-foreground">
                                RUT <Resaltado texto={f.empresa.rut} busqueda={busqueda} />
                              </span>
                            )}
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
