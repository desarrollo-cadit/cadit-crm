"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { SoftwareForm } from "@/components/licenses/software-form";
import { filtrarFilas, type EstadoDeLicencia, type FilaDeLicenciaVista } from "@/lib/license-view";
import type { LicenseSource } from "@/lib/license-source";
import type { VistaDeLicenciasDto } from "@/server/license-view";
import type { SoftwareDto } from "@/lib/types";
import { ACADEMY_TIME_ZONE, ultimoDiaDelPlazo } from "@/lib/schedule-time";
import { cn, formatCalendarDay } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { LicenseEmailText } from "@/components/enrollments/license-email";

const ORIGEN: Record<LicenseSource, string> = { grupo: "Del grupo", individual: "Individual" };

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
            <div className="rounded-lg border">
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
                <div className="flex flex-wrap items-end gap-2">
                  <h2 className="mr-auto font-semibold">{programa.name}</h2>
                  <Select
                    className="h-8 w-auto text-xs"
                    aria-label="Filtrar por grupo"
                    value={cohorte}
                    onChange={(ev) => setCohorte(ev.target.value)}
                  >
                    <option value="">Todos los grupos</option>
                    {data.cohortes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="h-8 w-auto text-xs"
                    aria-label="Filtrar por origen"
                    value={origen}
                    onChange={(ev) => setOrigen(ev.target.value as "" | LicenseSource)}
                  >
                    <option value="">Grupo e individuales</option>
                    <option value="grupo">Del grupo</option>
                    <option value="individual">Individuales</option>
                  </Select>
                  <Input
                    className="h-8 w-48 text-xs"
                    type="search"
                    placeholder="Buscar alumno…"
                    aria-label="Buscar alumno"
                    value={q}
                    onChange={(ev) => setQ(ev.target.value)}
                  />
                </div>

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
                          {f.contactName} —{" "}
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

                {filas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {programa.filas.length === 0
                      ? "Nadie tiene este programa asignado."
                      : "Ninguna licencia coincide con el filtro."}
                  </p>
                ) : (
                  <div className="rounded-lg border">
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
                          <TableRow key={f.licenseId}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/contacts/${f.contactId}/legajo`}
                                className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                              >
                                {f.contactName}
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
