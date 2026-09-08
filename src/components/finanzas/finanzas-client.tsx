"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

/**
 * 026 — Administración y finanzas: el cierre de un mes, para transcribir.
 *
 * **Esta pantalla se copia a mano.** La academia lleva la contabilidad en Bit,
 * y la decisión del dueño es que la salida sea una pantalla y no un archivo:
 * un export con formato es un contrato con un importador que no controlamos, y
 * el día que cambie el layout nos enteramos en cierre de mes.
 *
 * Eso cambia qué es "estar bien" acá:
 *
 * - **Dos vistas separadas, nunca sumadas.** Caja es la plata que ENTRÓ en el
 *   período; Devengado, las cuotas que se EMITIERON, cobradas o no. Una cuota
 *   de agosto cobrada en septiembre está en el devengado de agosto y en la
 *   caja de septiembre: eso no es una inconsistencia, es la definición. La
 *   pantalla no ofrece ninguna operación que las combine, porque cualquier
 *   número así necesita un criterio contable que el CRM no tiene.
 * - **Un bloque por moneda, y no existe un total general.** No es que se
 *   muestre en cero: no es representable. Un contador que transcribe un total
 *   de tres monedas carga basura, y nadie se entera hasta el cierre del
 *   ejercicio.
 * - **Las filas salen siempre en el mismo orden.** Es el requisito silencioso
 *   de toda pantalla de transcripción: quien vuelve después de una
 *   interrupción tiene que reencontrar la fila donde la dejó.
 *
 * DV-001 — No hay marca de "transcrito" por fila. Se resolvió por la
 * alternativa barata: acotar el período por rango de fechas. Si algún día se
 * pide la marca, es una tabla nueva con su RLS y sus endpoints — media fase,
 * no una casilla.
 */

type Currency = "UYU" | "PYG" | "USD";
type Estado = "pagada" | "parcial" | "vencida" | "pendiente";

type FilaCaja = {
  id: string;
  fecha: string;
  alumno: string;
  cohorte: string;
  curso: string;
  metodo: "efectivo" | "transferencia" | "tarjeta" | "otro";
  importe: number;
  currency: Currency;
  recibo: string | null;
};

type FilaDevengado = {
  id: string;
  vencimiento: string;
  numero: number;
  alumno: string;
  cohorte: string;
  curso: string;
  importe: number;
  pagado: number;
  saldo: number;
  estado: Estado;
  currency: Currency;
};

type FilaAnulada = {
  id: string;
  fecha: string;
  anuladoEl: string;
  alumno: string;
  cohorte: string;
  curso: string;
  importe: number;
  currency: Currency;
  motivo: string | null;
};

type Cierre = {
  periodo: {
    mes: string;
    etiqueta: string;
    desde: string;
    hasta: string;
    timezone: string;
  };
  caja: { currency: Currency; filas: FilaCaja[]; total: number }[];
  devengado: {
    currency: Currency;
    filas: FilaDevengado[];
    totalEmitido: number;
    totalPagado: number;
    totalSaldo: number;
  }[];
  anulados: FilaAnulada[];
};

type Cohorte = { id: string; name: string | null; courseName?: string | null };

const METODO: Record<FilaCaja["metodo"], string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

/**
 * El vocabulario es el de `installmentStatus` (FR-014). No se inventa uno
 * paralelo: un modelo de tres valores pierde `parcial`, que es justamente el
 * caso donde caja y devengado no coinciden.
 */
const ESTADO: Record<Estado, { texto: string; variante: "success" | "warning" | "destructive" | "secondary" }> = {
  pagada: { texto: "Pagada", variante: "success" },
  parcial: { texto: "Parcial", variante: "warning" },
  vencida: { texto: "Vencida", variante: "destructive" },
  pendiente: { texto: "Pendiente", variante: "secondary" },
};

/**
 * Los importes NO llevan símbolo de moneda pegado al número: la moneda se
 * declara una vez, en el encabezado del bloque y en el total. Un `$` delante
 * de un número en un bloque de guaraníes es exactamente el tipo de detalle que
 * se transcribe mal.
 */
const miles = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });

function fecha(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Los últimos 18 meses, del más reciente al más viejo. Suficiente para un cierre. */
function mesesDisponibles(): { valor: string; texto: string }[] {
  const NOMBRES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const hoy = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const valor = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { valor, texto: `${NOMBRES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });
}

export function FinanzasClient() {
  const [mes, setMes] = useState<string>("");
  const [cohortId, setCohortId] = useState<string>("");
  const [cohortes, setCohortes] = useState<Cohorte[]>([]);
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"caja" | "devengado">("caja");
  const [busqueda, setBusqueda] = useState("");

  const meses = mesesDisponibles();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    if (cohortId) params.set("cohortId", cohortId);
    const res = await fetch(`/api/finanzas/cierre?${params.toString()}`).catch(() => null);
    setCargando(false);
    if (!res?.ok) {
      setError(
        "No se pudo cargar el período. Volvé a intentar; si sigue igual, avisá a quien administra la instancia."
      );
      return;
    }
    const data = (await res.json()) as Cierre;
    setCierre(data);
    // El servidor decide el período por defecto (el mes anterior, que es el
    // que se cierra): la pantalla adopta el que le contestaron en vez de
    // calcularlo por su cuenta y arriesgarse a mostrar otro.
    if (!mes) setMes(data.periodo.mes);
  }, [mes, cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/cohorts").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { cohorts: Cohorte[] };
      setCohortes(data.cohorts ?? []);
    })();
  }, []);

  const filtra = (fila: { alumno: string; cohorte: string; curso: string }) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${fila.alumno} ${fila.cohorte} ${fila.curso}`.toLowerCase().includes(q);
  };

  return (
    <div className="space-y-5 p-6">
      <header className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="h-5 w-5" />
            Finanzas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El cierre de un período, para transcribir a la contabilidad. Caja es
            lo que entró; devengado, lo que se emitió. Son dos preguntas
            distintas y no se suman entre sí.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Período
            <Select
              className="w-52"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Período"
            >
              {meses.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </Select>
          </label>

          {/* DV-005 — Filtro opcional por camada, encima del período: cuando
              algo no cuadra, la pregunta siguiente siempre es de qué camada era. */}
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Camada
            <Select
              className="w-64"
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              aria-label="Camada"
            >
              <option value="">Todas</option>
              {cohortes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.courseName ?? c.id}
                </option>
              ))}
            </Select>
          </label>

          {/*
            DV-001, la alternativa barata: no hay marca de "transcrito", así
            que la forma de no perder el hilo es acotar. La búsqueda no cambia
            los totales del bloque —eso sería una trampa— sólo esconde filas.
          */}
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Buscar en las filas
            <Input
              className="w-64"
              placeholder="Alumno, camada o curso"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {cargando && !cierre ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : cierre ? (
        <>
          <div className="flex gap-2 border-b border-border">
            {(
              [
                { key: "caja", label: "Caja" },
                { key: "devengado", label: "Devengado" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={vista === t.key}
                className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                  vista === t.key
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => setVista(t.key)}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-text-3">
              {cierre.periodo.etiqueta} · {cierre.periodo.timezone}
            </span>
          </div>

          {vista === "caja" ? (
            <section className="space-y-6">
              <p className="text-xs text-text-3">
                Cobros recibidos en el período, por fecha de cobro. Los pagos
                anulados no figuran acá: no entraron.
              </p>
              {cierre.caja.length === 0 ? (
                <Vacio texto="No hubo cobros en este período." />
              ) : (
                cierre.caja.map((bloque) => (
                  <div key={bloque.currency} className="rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                      <h3 className="text-sm font-semibold">
                        Caja en {bloque.currency}
                      </h3>
                      <span className="text-sm">
                        <span className="text-text-3">Total {bloque.currency}: </span>
                        <span className="font-semibold tabular-nums">
                          {miles.format(bloque.total)}
                        </span>
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Alumno</TableHead>
                          <TableHead>Camada / curso</TableHead>
                          <TableHead>Medio</TableHead>
                          <TableHead>Recibo</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloque.filas.filter(filtra).map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="tabular-nums">
                              {fecha(f.fecha, cierre.periodo.timezone)}
                            </TableCell>
                            <TableCell>{f.alumno}</TableCell>
                            <TableCell className="text-text-2">
                              {f.cohorte} · {f.curso}
                            </TableCell>
                            <TableCell>{METODO[f.metodo]}</TableCell>
                            <TableCell className="text-text-3">{f.recibo ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {miles.format(f.importe)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))
              )}
            </section>
          ) : (
            <section className="space-y-6">
              <p className="text-xs text-text-3">
                Cuotas con vencimiento en el período, cobradas o no. Las cuotas
                anuladas no figuran: no se devengaron.
              </p>
              {cierre.devengado.length === 0 ? (
                <Vacio texto="No se emitieron cuotas con vencimiento en este período." />
              ) : (
                cierre.devengado.map((bloque) => (
                  <div key={bloque.currency} className="rounded-md border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                      <h3 className="text-sm font-semibold">
                        Devengado en {bloque.currency}
                      </h3>
                      <span className="flex gap-4 text-sm">
                        <span>
                          <span className="text-text-3">Emitido {bloque.currency}: </span>
                          <span className="font-semibold tabular-nums">
                            {miles.format(bloque.totalEmitido)}
                          </span>
                        </span>
                        <span>
                          <span className="text-text-3">Cobrado {bloque.currency}: </span>
                          <span className="font-semibold tabular-nums">
                            {miles.format(bloque.totalPagado)}
                          </span>
                        </span>
                        <span>
                          <span className="text-text-3">Saldo {bloque.currency}: </span>
                          <span className="font-semibold tabular-nums">
                            {miles.format(bloque.totalSaldo)}
                          </span>
                        </span>
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vencimiento</TableHead>
                          <TableHead>Alumno</TableHead>
                          <TableHead>Camada / curso</TableHead>
                          <TableHead>Cuota</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                          <TableHead className="text-right">Pagado</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloque.filas.filter(filtra).map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="tabular-nums">
                              {fecha(f.vencimiento, cierre.periodo.timezone)}
                            </TableCell>
                            <TableCell>{f.alumno}</TableCell>
                            <TableCell className="text-text-2">
                              {f.cohorte} · {f.curso}
                            </TableCell>
                            <TableCell className="tabular-nums">#{f.numero}</TableCell>
                            <TableCell>
                              <Badge variant={ESTADO[f.estado].variante}>
                                {ESTADO[f.estado].texto}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {miles.format(f.importe)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {miles.format(f.pagado)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {miles.format(f.saldo)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))
              )}
            </section>
          )}

          {/*
            DV-004 — Las anulaciones del período, en un tercer listado chico y
            explícitamente aparte. Nunca mezcladas con Caja: no entraron. Está
            para que un pago que ya se transcribió y después se anuló se pueda
            encontrar, en vez de desaparecer sin explicación.
          */}
          {cierre.anulados.length > 0 && (
            <section className="rounded-md border border-dashed border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <Ban className="h-4 w-4 text-text-3" />
                <h3 className="text-sm font-semibold">
                  Pagos anulados del período ({cierre.anulados.length})
                </h3>
              </div>
              <p className="px-4 pt-3 text-xs text-text-3">
                No cuentan para ningún total de Caja. Se listan aparte para que
                una anulación posterior a la transcripción se pueda rastrear.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha del cobro</TableHead>
                    <TableHead>Anulado el</TableHead>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Camada / curso</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cierre.anulados.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums">
                        {fecha(a.fecha, cierre.periodo.timezone)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fecha(a.anuladoEl, cierre.periodo.timezone)}
                      </TableCell>
                      <TableCell>{a.alumno}</TableCell>
                      <TableCell className="text-text-2">
                        {a.cohorte} · {a.curso}
                      </TableCell>
                      <TableCell className="text-text-3">{a.motivo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {miles.format(a.importe)} {a.currency}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      {texto}
    </p>
  );
}
