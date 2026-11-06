"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Receipt } from "lucide-react";
import { BillingPanel } from "@/components/cohorts/billing-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
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
  agruparPorEmpresa,
  contadoresDeFacturacion,
  facturaComun,
  facturacionCsv,
  filtrarFacturacion,
  normalizarNumero,
  totalesPorMoneda,
  type BloqueDeFacturacion,
  type EstadoFacturacion,
  type FilaFacturacion,
  type FiltrosFacturacion,
  type ResumenDeCobro,
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

/** Alumno, curso, inicio, vendedor, monto, empresa, cobro, factura. */
const COLUMNAS = 8;

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
  puedeRegistrarCobro = false,
  puedeCorregirCobro = false,
  initialTab = "pendientes",
  initialCohortId = null,
}: {
  puedeFacturar: boolean;
  /** `cobranza.registrar`: armar el plan y registrar pagos desde la venta. */
  puedeRegistrarCobro?: boolean;
  /** `cobranza.editar`: refinanciar y anular pagos desde la venta. */
  puedeCorregirCobro?: boolean;
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
  /** Las ventas con el seguimiento de pagos abierto (por id de inscripción). */
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  /** El bloque de empresa que se está pasando a una sola venta (diálogo abierto). */
  const [pasando, setPasando] = useState<Extract<BloqueDeFacturacion, { tipo: "empresa" }> | null>(null);
  /** Lo que se está escribiendo en la factura única de cada empresa, por clave de bloque. */
  const [borradoresDeEmpresa, setBorradoresDeEmpresa] = useState<Record<string, string>>({});

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCargando(true);
        setError(null);
      }
      const res = await fetch(`/api/facturacion?estado=${estado}`).catch(() => null);
      if (!silencioso) setCargando(false);
      if (!res?.ok) {
        if (!silencioso) {
          setError("No pudimos cargar las ventas. Si al reintentar sigue igual, avisale a quien administra la instancia.");
        }
        return;
      }
      const data = (await res.json()) as Respuesta;
      setFilas(data.filas);
      if (!silencioso) setBorradores({});
    },
    [estado]
  );

  /** Tras registrar un pago o armar un plan: refresca el resumen sin parpadear. */
  const refrescarCobro = useCallback(() => void cargar(true), [cargar]);

  function alternar(id: string) {
    setAbiertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
  const bloques = useMemo(() => agruparPorEmpresa(visibles), [visibles]);
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

  /** Una sola factura para todos los alumnos de una empresa en el grupo. */
  async function guardarDeEmpresa(b: Extract<BloqueDeFacturacion, { tipo: "empresa" }>) {
    const numero = normalizarNumero(borradoresDeEmpresa[b.clave] ?? facturaComun(b.filas) ?? "");
    if (estado === "pendientes" && numero === null) return;
    const ids = b.filas.map((f) => f.enrollmentId);
    const anterior = filas;
    const sale = (estado === "pendientes") === (numero !== null);
    setFilas((fs) =>
      sale
        ? fs.filter((f) => !ids.includes(f.enrollmentId))
        : fs.map((f) => (ids.includes(f.enrollmentId) ? { ...f, invoiceNumber: numero } : f))
    );
    setGuardando((g) => ({ ...g, [b.clave]: true }));
    const res = await fetch("/api/facturacion/empresa", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentIds: ids, invoiceNumber: numero }),
    }).catch(() => null);
    setGuardando((g) => ({ ...g, [b.clave]: false }));
    if (!res?.ok) {
      setFilas(anterior);
      notify.error(await mensajeDeError(res, "No se pudo guardar la factura de la empresa. Las ventas quedaron como estaban."));
      return;
    }
    const data = (await res.json()) as { avisos: string[] };
    setBorradoresDeEmpresa((d) => {
      const { [b.clave]: _, ...resto } = d;
      return resto;
    });
    for (const aviso of data.avisos) notify.warning(aviso);
    if (numero === null) notify.success(`Se borró la factura de ${b.empresa.razonSocial}: vuelve a Pendientes.`);
    else notify.success(`Factura ${numero} anotada para ${ids.length} alumnos de ${b.empresa.razonSocial}.`);
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


  /** Cobro de la venta: cuánto va pagado y cómo viene el plan (de las cuotas y pagos de Cobranza). */
  function celdaDeCobro(f: FilaFacturacion, ventaEnBloque: boolean) {
    // Venta de empresa: el cobro es de la venta, no de cada persona. Dentro de su
    // bloque se gestiona en el encabezado; suelta (otros alumnos filtrados), se
    // aclara de quién es.
    if (f.venta && !f.venta.esTitular) {
      return (
        <span className="text-xs text-muted-foreground">
          Incluido en la venta de la empresa
          {!ventaEnBloque && (
            <span className="block tabular-nums">
              Cobrado {dinero(f.venta.cobro.pagado, f.venta.currency)}
              {f.venta.amount !== null && <> de {dinero(f.venta.amount, f.venta.currency)}</>}
            </span>
          )}
        </span>
      );
    }
    if (f.venta?.esTitular && ventaEnBloque) {
      return <span className="text-xs text-muted-foreground">Titular de la venta de la empresa</span>;
    }
    const c: ResumenDeCobro = f.cobro;
    const abierta = abiertas.has(f.enrollmentId);
    return (
      <div className="space-y-1 text-xs">
        {c.estado === "sin_plan" && c.pagado === 0 ? (
          <span className="text-muted-foreground">Sin pagos ni plan</span>
        ) : (
          <>
            <span className="block tabular-nums">
              {dinero(c.pagado, f.currency)}
              {f.amount !== null && <span className="text-muted-foreground"> de {dinero(f.amount, f.currency)}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {c.estado === "pagada" ? (
                <Badge variant="success">Pagada</Badge>
              ) : c.estado === "vencida" ? (
                <Badge variant="destructive">
                  {c.cuotasVencidas} {c.cuotasVencidas === 1 ? "cuota vencida" : "cuotas vencidas"}
                </Badge>
              ) : c.estado === "al_dia" ? (
                <Badge variant="secondary">Al día</Badge>
              ) : (
                <Badge variant="secondary">Sin plan</Badge>
              )}
              {c.cuotas > 0 && (
                <span className="text-muted-foreground">
                  {c.cuotasPagadas}/{c.cuotas} cuotas
                </span>
              )}
            </span>
          </>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-muted-foreground underline hover:text-foreground"
          aria-expanded={abierta}
          onClick={() => alternar(f.enrollmentId)}
        >
          {abierta ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Seguimiento de pagos
        </button>
      </div>
    );
  }

  /** Una venta; `enGrupo` = va debajo del encabezado de su empresa, que lleva la factura única. */
  function renderVenta(f: FilaFacturacion, enGrupo: boolean, ventaEnBloque = false) {
  const borrador = borradores[f.enrollmentId] ?? f.invoiceNumber ?? "";
                    return (
      <>
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
                              {f.venta && !f.venta.esTitular ? (
                                <span className="text-muted-foreground">En la venta</span>
                              ) : f.amount === null ? (
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
                            <TableCell>{celdaDeCobro(f, ventaEnBloque)}</TableCell>
                            <TableCell>
                              {enGrupo ? (
                                (f.invoiceNumber ?? <span className="text-muted-foreground">—</span>)
                              ) : puedeFacturar ? (
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
        {abiertas.has(f.enrollmentId) && !ventaEnBloque && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={COLUMNAS} className="bg-subtle">
              <BillingPanel
                enrollmentId={f.enrollmentId}
                currency={f.currency}
                puedeRegistrar={puedeRegistrarCobro}
                puedeCorregir={puedeCorregirCobro}
                puedeAnotarRecibo={puedeFacturar}
                onChanged={refrescarCobro}
              />
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  /** El encabezado de una empresa con varios alumnos en el mismo grupo: UNA factura para todos. */
  function renderEncabezadoDeEmpresa(b: Extract<BloqueDeFacturacion, { tipo: "empresa" }>) {
    const comun = facturaComun(b.filas);
    const borrador = borradoresDeEmpresa[b.clave] ?? comun ?? "";
    const monedas = new Set(b.filas.map((f) => f.currency));
    const unaMoneda = monedas.size === 1 ? [...monedas][0]! : null;
    const pactado = b.filas.reduce((s, f) => s + (f.amount ?? 0), 0);
    const pagado = b.filas.reduce((s, f) => s + f.cobro.pagado, 0);
    const distintos = new Set(b.filas.map((f) => f.invoiceNumber)).size > 1;
    return (
      <TableRow className="bg-subtle hover:bg-subtle">
        <TableCell colSpan={COLUMNAS - 1} className="text-sm">
          <span className="font-medium">
            <Resaltado texto={b.empresa.razonSocial} busqueda={busqueda} />
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {b.filas.length} alumnos en este grupo
            {b.venta ? (
              <>
                {" "}
                · venta única{b.venta.amount !== null && <> {dinero(b.venta.amount, b.venta.currency)}</>} · cobrado{" "}
                {dinero(b.venta.cobro.pagado, b.venta.currency)}
                {b.venta.cobro.saldo !== null && <> · saldo {dinero(b.venta.cobro.saldo, b.venta.currency)}</>}
              </>
            ) : (
              unaMoneda && (
                <>
                  {" "}
                  · pactado {dinero(pactado, unaMoneda)} · cobrado {dinero(pagado, unaMoneda)}
                </>
              )
            )}
          </span>
          {b.venta ? (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {b.venta.cobro.estado === "pagada" ? (
                <Badge variant="success">Pagada</Badge>
              ) : b.venta.cobro.estado === "vencida" ? (
                <Badge variant="destructive">
                  {b.venta.cobro.cuotasVencidas} {b.venta.cobro.cuotasVencidas === 1 ? "cuota vencida" : "cuotas vencidas"}
                </Badge>
              ) : b.venta.cobro.estado === "al_dia" ? (
                <Badge variant="secondary">Al día</Badge>
              ) : (
                <Badge variant="secondary">Sin plan</Badge>
              )}
              {b.venta.cobro.cuotas > 0 && (
                <span className="text-muted-foreground">
                  {b.venta.cobro.cuotasPagadas}/{b.venta.cobro.cuotas} cuotas
                </span>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-muted-foreground underline hover:text-foreground"
                aria-expanded={abiertas.has(b.venta.titularId)}
                onClick={() => alternar(b.venta!.titularId)}
              >
                {abiertas.has(b.venta.titularId) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Seguimiento de pagos de la empresa
              </button>
            </span>
          ) : (
            puedeRegistrarCobro && (
              <span className="mt-1 block text-xs">
                <button
                  type="button"
                  className="underline text-muted-foreground hover:text-foreground"
                  onClick={() => setPasando(b)}
                >
                  Pasar a una sola venta
                </button>
                <span className="text-muted-foreground"> · el total, las cuotas y los pagos se gestionan una vez, no por persona</span>
              </span>
            )
          )}
          {distintos && (
            <span className="block text-xs text-warning">
              Tienen números de factura distintos: anotar uno acá los unifica.
            </span>
          )}
        </TableCell>
        <TableCell>
          {puedeFacturar ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void guardarDeEmpresa(b);
              }}
            >
              <Input
                className="h-8 w-32"
                maxLength={MAX_NUMERO}
                placeholder="N.º de factura"
                aria-label={`Número de factura de ${b.empresa.razonSocial}`}
                value={borrador}
                onChange={(e) => setBorradoresDeEmpresa((d) => ({ ...d, [b.clave]: e.target.value }))}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={
                  guardando[b.clave] ||
                  normalizarNumero(borrador) === comun ||
                  (estado === "pendientes" && normalizarNumero(borrador) === null)
                }
              >
                {estado === "pendientes" ? "Registrar a todos" : "Corregir a todos"}
              </Button>
            </form>
          ) : (
            (comun ?? <span className="text-muted-foreground">—</span>)
          )}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {pasando && (
        <PasarAVentaUnica
          bloque={pasando}
          onClose={() => setPasando(null)}
          onHecho={() => {
            setPasando(null);
            void cargar(true);
          }}
        />
      )}
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
                  <TableHead>Cobro</TableHead>
                  <TableHead>Factura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bloques.map((b) =>
                  b.tipo === "fila" ? (
                    <Fragment key={b.fila.enrollmentId}>{renderVenta(b.fila, false)}</Fragment>
                  ) : (
                    <Fragment key={b.clave}>
                      {renderEncabezadoDeEmpresa(b)}
                      {b.venta && abiertas.has(b.venta.titularId) && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={COLUMNAS} className="bg-subtle">
                            <BillingPanel
                              enrollmentId={b.venta.titularId}
                              currency={b.venta.currency}
                              puedeRegistrar={puedeRegistrarCobro}
                              puedeCorregir={puedeCorregirCobro}
                              puedeAnotarRecibo={puedeFacturar}
                              onChanged={refrescarCobro}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                      {b.filas.map((f) => (
                        <Fragment key={f.enrollmentId}>{renderVenta(f, true, b.venta !== null)}</Fragment>
                      ))}
                    </Fragment>
                  )
                )}
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

/**
 * 2026-11-06 — Pasa a los alumnos de una empresa en un grupo a UNA venta: un
 * total, y desde ahí las cuotas y los pagos se gestionan una vez. Solo se puede
 * si ninguno tiene cuotas ni pagos propios (el servidor lo rechaza si no).
 */
function PasarAVentaUnica({
  bloque,
  onClose,
  onHecho,
}: {
  bloque: Extract<BloqueDeFacturacion, { tipo: "empresa" }>;
  onClose: () => void;
  onHecho: () => void;
}) {
  const primera = bloque.filas[0]!;
  const [titularId, setTitularId] = useState(primera.enrollmentId);
  const [total, setTotal] = useState<number | null>(
    bloque.filas.every((f) => f.amount !== null && f.currency === primera.currency)
      ? bloque.filas.reduce((suma, f) => suma + (f.amount ?? 0), 0)
      : null
  );
  const [guardando, setGuardando] = useState(false);
  const moneda = primera.currency;

  async function confirmar() {
    if (!total) return;
    setGuardando(true);
    const res = await fetch(`/api/cohorts/${primera.cohortId}/company-sale`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: bloque.empresa.id, titularId, total, currency: moneda }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo pasar a una sola venta."));
      return;
    }
    notify.success(`${bloque.empresa.razonSocial}: ahora es una sola venta.`);
    onHecho();
  }

  return (
    <Modal onClose={onClose} busy={guardando} labelledBy="venta-unica-title" className="max-w-md">
      <h3 id="venta-unica-title" className="mb-1 font-semibold">
        Pasar a una sola venta
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        {bloque.empresa.razonSocial} · {bloque.filas.length} alumnos. El total, las cuotas y los pagos se gestionan una
        vez, en la venta de la empresa; los alumnos quedan incluidos, sin monto propio. Solo se puede si ninguno tiene
        cuotas o pagos cargados por persona.
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="venta-titular">Alumno titular de la venta</Label>
          <Select id="venta-titular" value={titularId} onChange={(e) => setTitularId(e.target.value)}>
            {bloque.filas.map((f) => (
              <option key={f.enrollmentId} value={f.enrollmentId}>
                {f.alumno}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Es solo donde se guarda la venta. Si esa persona se da de baja, pasa a otro alumno del grupo.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venta-total">Total que se le factura a la empresa</Label>
          <MoneyInput id="venta-total" value={total} onChange={setTotal} currency={moneda} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={guardando || !total} onClick={() => void confirmar()}>
          {guardando ? "Guardando…" : "Pasar a una sola venta"}
        </Button>
      </div>
    </Modal>
  );
}
