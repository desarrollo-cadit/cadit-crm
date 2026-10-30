"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { SoftwareForm } from "@/components/licenses/software-form";
import {
  contadoresDeLicencias,
  filtrarFilas,
  type EstadoDeLicencia,
  type FilaDeLicenciaVista,
} from "@/lib/license-view";
import {
  Buscador,
  Desplegable,
  OpcionUnica,
  Resaltado,
  ResumenDeFiltros,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import type { LicenseSource } from "@/lib/license-source";
import type { VistaDeLicenciasDto } from "@/server/license-view";
import type { SoftwareDto } from "@/lib/types";
import { ACADEMY_TIME_ZONE, ultimoDiaDelPlazo } from "@/lib/schedule-time";
import { cn, formatCalendarDay } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { LicenseEmailText } from "@/components/enrollments/license-email";

const ORIGEN: Record<LicenseSource, string> = { grupo: "Del grupo", individual: "Individual" };

/** 2026-10-30 — El valor del desplegable "Origen" y su opción. */
const ORIGEN_FILTRO: Record<"" | LicenseSource, { valor: string; opcion: string }> = {
  "": { valor: "Todos", opcion: "Grupo e individuales" },
  grupo: { valor: "Del grupo", opcion: "Del grupo" },
  individual: { valor: "Individuales", opcion: "Individuales" },
};

const ESTADO: Record<EstadoDeLicencia, { label: string; variant: "success" | "secondary" | "warning" }> = {
  en_uso: { label: "En uso", variant: "success" },
  vencida: { label: "Vencida", variant: "warning" },
  curso_terminado: { label: "Curso terminado", variant: "secondary" },
};

const DIA_CORTO = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

/** Cuándo se asignó: un INSTANTE, en la hora de quien mira. */
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-UY", DIA_CORTO) : "—";

/**
 * El vencimiento se guarda como el instante en que TERMINA el día elegido en
 * la academia (01/04 00:00 de Montevideo para el 31/03): se muestra ese día.
 */
const vence = (iso: string | null) => {
  const dia = iso ? ultimoDiaDelPlazo(new Date(iso), ACADEMY_TIME_ZONE) : null;
  return dia ? formatCalendarDay(`${dia}T00:00:00.000Z`, DIA_CORTO) : "—";
};

/**
 * 035 (US3, FR-013..FR-016) — Licencias por programa: quién tiene cada una
 * sin abrir ninguna cohorte.
 *
 * Arriba, un renglón por programa con total, asignadas y libres (la misma
 * cuenta que el stock: sólo cuentan las que ocupan). Al elegir uno, la lista
 * con filtros por cohorte y origen y búsqueda por alumno. Una individual se
 * desasigna acá; una del grupo no —se quita desde la cohorte— y la fila lo
 * dice con el acceso directo (FR-015). Los alumnos del grupo que quedaron sin
 * licencia por falta de stock se ven destacados (FR-016).
 *
 * 2026-10-16 (pedido del dueño) — El catálogo también vive acá: "Nuevo
 * programa" y "Editar" (nombre, foto, total) con `SoftwareForm` y las
 * mismas rutas `/api/software`. Antes era la pestaña Software de Académico.
 * `canEdit` lo decide el servidor con `academico.editar`, la capacidad que
 * exigen POST/PATCH de esas rutas.
 *
 * 2026-10-26 — Desasignar es `canManage` (`licencias.gestionar`, la de
 * `DELETE /api/enrollments/[id]/license`): asignar y quitar licencias es de
 * soporte. Sin ella, la fila se ve sin botón.
 */
export function LicensesView({
  canEdit,
  canManage,
}: {
  canEdit: boolean;
  canManage: boolean;
}) {
  const [data, setData] = useState<VistaDeLicenciasDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [cohorte, setCohorte] = useState("");
  const [origen, setOrigen] = useState<"" | LicenseSource>("");
  const [q, setQ] = useState("");
  const [desasignar, setDesasignar] = useState<FilaDeLicenciaVista | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; software: SoftwareDto } | null>(
    null
  );
  /**
   * La foto se sirve con caché de un día: después de guardar se cambia la
   * URL para que la nueva se vea sin recargar.
   */
  const [fotoVersion, setFotoVersion] = useState(0);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/licenses").catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar las licencias");
      return;
    }
    setError(null);
    setData((await res.json()) as VistaDeLicenciasDto);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const programa = data?.programas.find((p) => p.softwareId === elegido) ?? data?.programas[0] ?? null;
  const filas = useMemo(
    () => (programa ? filtrarFilas(programa.filas, { cohortId: cohorte, source: origen || null, q }) : []),
    [programa, cohorte, origen, q]
  );
  const faltantes = useMemo(
    () =>
      programa
        ? filtrarFilas(
            programa.faltantes.map((f) => ({ ...f, source: "grupo" as const })),
            { cohortId: cohorte, source: origen || null, q }
          )
        : [],
    [programa, cohorte, origen, q]
  );

  /**
   * 2026-10-30 — Como Académico: buscador y filtros en una tarjeta, con las
   * cantidades de `contadoresDeLicencias` (puro, con tests) y el resumen.
   */
  const contadores = useMemo(
    () =>
      programa
        ? contadoresDeLicencias(programa.filas, { cohortId: cohorte, source: origen || null, q })
        : null,
    [programa, cohorte, origen, q]
  );
  const gruposDelPrograma = useMemo(() => {
    if (!data || !programa) return [];
    const presentes = new Set<string>([
      ...programa.filas.flatMap((f) => (f.cohortId ? [f.cohortId] : [])),
      ...programa.faltantes.map((f) => f.cohortId),
      ...(cohorte ? [cohorte] : []),
    ]);
    return data.cohortes.filter((c) => presentes.has(c.id));
  }, [data, programa, cohorte]);
  const nombreDeGrupo = cohorte
    ? (data?.cohortes.find((c) => c.id === cohorte)?.name ?? "Otro grupo")
    : null;
  const filtrosActivos: FiltroActivo[] = [
    ...(q.trim() ? [{ clave: "q", etiqueta: `“${q.trim()}”`, quitar: () => setQ("") }] : []),
    ...(nombreDeGrupo
      ? [{ clave: "grupo", etiqueta: `Grupo: ${nombreDeGrupo}`, quitar: () => setCohorte("") }]
      : []),
    ...(origen
      ? [{ clave: "origen", etiqueta: `Origen: ${ORIGEN_FILTRO[origen].valor}`, quitar: () => setOrigen("") }]
      : []),
  ];
  function limpiarFiltros() {
    setQ("");
    setCohorte("");
    setOrigen("");
  }

  async function confirmarDesasignar(f: FilaDeLicenciaVista) {
    setBusy(true);
    const res = await fetch(
      `/api/enrollments/${f.enrollmentId}/license?softwareId=${encodeURIComponent(f.softwareId)}`,
      { method: "DELETE" }
    ).catch(() => null);
    setBusy(false);
    setDesasignar(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudo desasignar la licencia");
    } else {
      notify.success(`Licencia de ${f.contactName} liberada: volvió al stock.`);
    }
    void refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h1 className="font-semibold">Licencias</h1>
          <p className="text-xs text-muted-foreground">
            Los programas, su stock y quién tiene cada uno. Las asignadas a un grupo se quitan desde ese grupo.
          </p>
        </div>
        {canEdit && data && data.programas.length > 0 && (
          <Button size="sm" onClick={() => setForm({ mode: "create" })}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo programa
          </Button>
        )}
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {!data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.programas.length === 0 ? (
          <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
              <KeyRound className="h-5 w-5 text-brand-text" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <p className="font-medium">Todavía no hay programas</p>
              <p className="text-sm text-muted-foreground">
                Un programa es el software que se les da a los alumnos —por ejemplo Revit o
                AutoCAD—, con la cantidad de licencias que tiene la academia. Cargalo acá y
                después asignalo a un grupo o a un alumno.
              </p>
            </div>
            {canEdit ? (
              <Button size="sm" onClick={() => setForm({ mode: "create" })}>
                <Plus className="h-4 w-4" aria-hidden /> Nuevo programa
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pedile a alguien con permiso de edición académica que los cargue.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader className="bg-subtle">
                  <TableRow>
                    <TableHead>Programa</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Asignadas</TableHead>
                    <TableHead className="text-right">Libres</TableHead>
                    <TableHead>Sin licencia</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.programas.map((p) => (
                    <TableRow
                      key={p.softwareId}
                      className={cn(p.softwareId === programa?.softwareId && "bg-brand-tint")}
                    >
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          aria-pressed={p.softwareId === programa?.softwareId}
                          onClick={() => setElegido(p.softwareId)}
                        >
                          {p.hasPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/software/${p.softwareId}/photo?v=${fotoVersion}`}
                              alt=""
                              className="h-7 w-7 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-subtle">
                              <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </span>
                          )}
                          {p.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.asignadas}</TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", p.libres <= 0 && "text-warning")}
                      >
                        {p.libres}
                      </TableCell>
                      <TableCell>
                        {p.faltantes.length > 0 ? (
                          <Badge variant="warning">
                            {p.faltantes.length} del grupo sin stock
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            aria-label={`Editar ${p.name}`}
                            onClick={() =>
                              setForm({
                                mode: "edit",
                                software: {
                                  id: p.softwareId,
                                  name: p.name,
                                  totalLicenses: p.total,
                                  hasPhoto: p.hasPhoto,
                                },
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {programa && (
              <section className="space-y-3" aria-label={`Licencias de ${programa.name}`}>
                <h2 className="font-semibold">{programa.name}</h2>
                {(programa.filas.length > 0 || programa.faltantes.length > 0) && (
                  <TarjetaDeFiltros
                    pie={
                      <ResumenDeFiltros
                        mostrando={filas.length}
                        total={programa.filas.length}
                        sustantivo={{ uno: "licencia", varios: "licencias" }}
                        activos={filtrosActivos}
                        onLimpiar={limpiarFiltros}
                      />
                    }
                  >
                    <Buscador value={q} onChange={setQ} placeholder="Buscar alumno…" />
                    <Desplegable etiqueta="Grupo" valor={nombreDeGrupo ?? "Todos"} activo={Boolean(cohorte)}>
                      {(cerrar) => (
                        <>
                          <OpcionUnica
                            elegida={!cohorte}
                            cantidad={contadores?.todosLosGrupos}
                            onElegir={() => {
                              setCohorte("");
                              cerrar();
                            }}
                          >
                            Todos los grupos
                          </OpcionUnica>
                          {gruposDelPrograma.map((c) => (
                            <OpcionUnica
                              key={c.id}
                              elegida={cohorte === c.id}
                              cantidad={contadores?.grupos.get(c.id) ?? 0}
                              onElegir={() => {
                                setCohorte(c.id);
                                cerrar();
                              }}
                            >
                              {c.name}
                            </OpcionUnica>
                          ))}
                        </>
                      )}
                    </Desplegable>
                    <Desplegable etiqueta="Origen" valor={ORIGEN_FILTRO[origen].valor} activo={Boolean(origen)}>
                      {(cerrar) => (
                        <>
                          {(["", "grupo", "individual"] as const).map((k) => (
                            <OpcionUnica
                              key={k || "todos"}
                              elegida={origen === k}
                              cantidad={contadores ? contadores.origen[k || "todos"] : null}
                              onElegir={() => {
                                setOrigen(k);
                                cerrar();
                              }}
                            >
                              {ORIGEN_FILTRO[k].opcion}
                            </OpcionUnica>
                          ))}
                        </>
                      )}
                    </Desplegable>
                  </TarjetaDeFiltros>
                )}

                {faltantes.length > 0 && (
                  <div
                    role="status"
                    className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-foreground"
                  >
                    <p className="mb-1.5 flex items-center gap-1.5 font-medium text-warning">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      Del grupo y sin licencia por falta de stock
                    </p>
                    <ul className="space-y-0.5">
                      {faltantes.map((f) => (
                        <li key={f.enrollmentId}>
                          <Resaltado texto={f.contactName} busqueda={q} /> —{" "}
                          <Link
                            href={`/cohorts/${f.cohortId}`}
                            className="underline underline-offset-2"
                          >
                            {f.cohortName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-muted-foreground">
                      Reciben la licencia cuando haya stock: liberá alguna o subí el total con
                      «Editar» en este programa, y volvé a asignar el programa desde el grupo.
                    </p>
                  </div>
                )}

                {programa.filas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-sm text-muted-foreground">
                    Nadie tiene este programa asignado.
                  </p>
                ) : filas.length === 0 ? (
                  <SinCoincidencias
                    mensaje="Ninguna licencia coincide con la búsqueda y los filtros."
                    onLimpiar={limpiarFiltros}
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border bg-card">
                    <Table>
                      <TableHeader className="bg-subtle">
                        <TableRow>
                          <TableHead>Alumno</TableHead>
                          <TableHead>Grupo</TableHead>
                          <TableHead>Origen</TableHead>
                          <TableHead>Asignada</TableHead>
                          <TableHead>Vence</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filas.map((f) => (
                          <TableRow key={f.licenseId} className="hover:bg-subtle">
                            <TableCell className="font-medium">
                              <Link
                                href={`/contacts/${f.contactId}/legajo`}
                                className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                              >
                                <Resaltado texto={f.contactName} busqueda={q} />
                              </Link>
                              {/* 2026-10-21 — Solo viaja con contactos.ver. */}
                              {f.licenseEmail && (
                                <div className="mt-0.5 font-normal">
                                  <LicenseEmailText value={f.licenseEmail} />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {f.cohortId ? (
                                <Link href={`/cohorts/${f.cohortId}`} className="hover:underline">
                                  {f.cohortName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">sin grupo</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{ORIGEN[f.source]}</TableCell>
                            <TableCell className="text-xs tabular-nums">{fecha(f.assignedAt)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{vence(f.expiresAt)}</TableCell>
                            <TableCell>
                              <Badge variant={ESTADO[f.estado].variant}>{ESTADO[f.estado].label}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {f.source === "grupo" ? (
                                // FR-015 — la del grupo no se desasigna acá.
                                f.cohortId ? (
                                  <Link
                                    href={`/cohorts/${f.cohortId}`}
                                    className="text-muted-foreground underline underline-offset-2"
                                  >
                                    Se quita desde el grupo
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">Se quita desde el grupo</span>
                                )
                              ) : canManage ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7"
                                  onClick={() => setDesasignar(f)}
                                >
                                  Desasignar
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {form && (
        <SoftwareForm
          initial={form.mode === "edit" ? form.software : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setFotoVersion((v) => v + 1);
            void refetch();
          }}
        />
      )}

      {desasignar && (
        <ConfirmSendDialog
          title="Desasignar la licencia"
          confirmLabel="Desasignar"
          busyLabel="Desasignando…"
          busy={busy}
          onClose={() => setDesasignar(null)}
          onConfirm={() => void confirmarDesasignar(desasignar)}
        >
          <p className="text-foreground">
            La licencia de {desasignar.contactName} vuelve al stock.
          </p>
        </ConfirmSendDialog>
      )}
    </div>
  );
}
