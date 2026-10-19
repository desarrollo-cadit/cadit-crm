"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatearDia } from "@/lib/access-expiry";
import { notify } from "@/lib/notify";

/**
 * 043 — "Quiénes tienen acceso" a un curso offline, en su pantalla.
 *
 * Una fila por FUENTE: por la cohorte (todo el grupo o solo esa inscripción)
 * o por un acceso directo a la persona. Con `academico.editar` además se da
 * el curso a una persona o a toda una empresa (con vista previa), y se
 * extiende o quita un acceso directo. Lo que viene de una cohorte se cambia
 * en la cohorte.
 */

type Fila = {
  contactId: string;
  contactName: string;
  source:
    | { kind: "cohorte"; enrollmentId: string; cohortId: string; cohortName: string; individual: boolean }
    | {
        kind: "directo";
        grantId: string;
        note: string | null;
        viaCompanyName: string | null;
        createdByName: string | null;
        createdAt: string;
      };
  hasta: string | null;
  vencido: boolean;
  origen: "calculado" | "manual" | "sin_fecha" | "directo";
};

type Plan = {
  crear: { contactId: string; name: string; antesQuitado: boolean }[];
  extender: { grantId: string; contactId: string; name: string; desde: string }[];
  sinCambios: { grantId: string; contactId: string; name: string; hasta: string }[];
};

async function mensajeDeError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function CourseAccessPanel({ courseId, canEdit }: { courseId: string; canEdit: boolean }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [verVencidos, setVerVencidos] = useState(false);
  const [editando, setEditando] = useState<{ grantId: string; fecha: string } | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/offline-courses/${courseId}/access`).catch(() => null);
    if (!res?.ok) {
      setFilas([]);
      return;
    }
    setFilas(((await res.json()) as { rows: Fila[] }).rows);
  }, [courseId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarFecha(grantId: string, fecha: string) {
    const res = await fetch(`/api/offline-course-grants/${grantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessUntil: fecha }),
    }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo cambiar la fecha"));
      return;
    }
    notify.success("Fecha actualizada");
    setEditando(null);
    void cargar();
  }

  async function quitar(grantId: string, nombre: string) {
    if (!window.confirm(`¿Quitarle el acceso a ${nombre}? Deja de ver el curso en este momento.`)) return;
    const res = await fetch(`/api/offline-course-grants/${grantId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo quitar el acceso"));
      return;
    }
    notify.success("Acceso quitado");
    void cargar();
  }

  const vigentes = (filas ?? []).filter((f) => !f.vencido);
  const vencidos = (filas ?? []).filter((f) => f.vencido);
  const visibles = verVencidos ? (filas ?? []) : vigentes;

  return (
    <section aria-labelledby="quienes-tienen-acceso" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="quienes-tienen-acceso" className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" aria-hidden />
          Quiénes tienen acceso ({vigentes.length})
        </h3>
        {vencidos.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={verVencidos} onChange={(e) => setVerVencidos(e.target.checked)} />
            Mostrar vencidos ({vencidos.length})
          </label>
        )}
      </div>

      {filas === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nadie tiene acceso a este curso en este momento.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {visibles.map((f) => {
            const key = f.source.kind === "cohorte" ? f.source.enrollmentId : f.source.grantId;
            return (
              <li key={key} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <Link
                  href={`/contacts/${f.contactId}/legajo`}
                  className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {f.contactName}
                </Link>
                {f.source.kind === "cohorte" ? (
                  <span className="text-xs text-muted-foreground">
                    Cohorte {f.source.cohortName}
                    {f.source.individual ? " (otorgado a esta inscripción)" : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Acceso directo
                    {f.source.viaCompanyName ? ` · empresa ${f.source.viaCompanyName}` : ""}
                    {f.source.note ? ` · ${f.source.note}` : ""}
                  </span>
                )}
                {f.hasta ? (
                  <Badge variant={f.vencido ? "destructive" : "secondary"}>
                    {f.vencido ? "Vencido el" : "Hasta el"} {formatearDia(f.hasta)}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin vencimiento</Badge>
                )}
                {f.origen === "manual" && <span className="text-xs text-muted-foreground">fecha fijada a mano</span>}

                {canEdit && f.source.kind === "directo" && editando?.grantId !== f.source.grantId && (
                  <span className="ml-auto flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground underline"
                      onClick={() =>
                        f.source.kind === "directo" &&
                        setEditando({ grantId: f.source.grantId, fecha: f.hasta ?? "" })
                      }
                    >
                      Cambiar fecha
                    </button>
                    <button
                      type="button"
                      className="text-danger underline"
                      onClick={() => f.source.kind === "directo" && void quitar(f.source.grantId, f.contactName)}
                    >
                      Quitar
                    </button>
                  </span>
                )}
                {f.source.kind === "directo" && editando?.grantId === f.source.grantId && (
                  <span className="ml-auto flex items-center gap-2">
                    <Input
                      type="date"
                      aria-label="Acceso hasta"
                      value={editando.fecha}
                      onChange={(e) => setEditando({ grantId: editando.grantId, fecha: e.target.value })}
                      className="h-8 w-40"
                    />
                    <Button
                      size="sm"
                      disabled={!editando.fecha}
                      onClick={() => void cambiarFecha(editando.grantId, editando.fecha)}
                    >
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DarAUnaPersona courseId={courseId} onDone={() => void cargar()} />
          <DarAUnaEmpresa courseId={courseId} onDone={() => void cargar()} />
        </div>
      )}
    </section>
  );
}

function DarAUnaPersona({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [elegida, setElegida] = useState<{ id: string; name: string } | null>(null);
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (elegida || q.trim().length < 2) {
      setOpciones([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(q.trim())}&pageSize=8`).catch(() => null);
        if (!res?.ok) return;
        const body = (await res.json()) as {
          contacts: { id: string; firstName: string; lastName: string | null; email: string | null }[];
        };
        setOpciones(
          body.contacts.map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            email: c.email,
          }))
        );
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [q, elegida]);

  async function dar() {
    if (!elegida) return;
    setEnviando(true);
    const res = await fetch(`/api/offline-courses/${courseId}/grants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: elegida.id, accessUntil: hasta, note: nota.trim() || null }),
    }).catch(() => null);
    setEnviando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo dar el acceso"));
      return;
    }
    notify.success(`Acceso guardado para ${elegida.name}`);
    setElegida(null);
    setQ("");
    setHasta("");
    setNota("");
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="h-4 w-4" aria-hidden />
        Dar acceso a una persona
      </p>
      {elegida ? (
        <p className="text-sm">
          {elegida.name}{" "}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setElegida(null)}>
            cambiar
          </button>
        </p>
      ) : (
        <div className="space-y-1">
          <Input
            aria-label="Buscar persona"
            placeholder="Buscar por nombre, correo o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {opciones.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border bg-card text-sm">
              {opciones.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => setElegida({ id: o.id, name: o.name })}
                  >
                    {o.name}
                    {o.email && <span className="ml-2 text-xs text-muted-foreground">{o.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Acceso hasta
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
          Nota (opcional)
          <Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
        </label>
        <Button size="sm" disabled={!elegida || !hasta || enviando} onClick={() => void dar()}>
          {enviando ? "Guardando…" : "Dar acceso"}
        </Button>
      </div>
    </div>
  );
}

function DarAUnaEmpresa({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [empresas, setEmpresas] = useState<{ id: string; legalName: string; people: number }[]>([]);
  const [empresa, setEmpresa] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/offline-courses/${courseId}/grants/company`).catch(() => null);
      if (!res?.ok) return;
      setEmpresas(((await res.json()) as { companies: typeof empresas }).companies);
    })();
  }, [courseId]);

  async function enviar(confirm: boolean) {
    setTrabajando(true);
    const res = await fetch(`/api/offline-courses/${courseId}/grants/company`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: empresa, accessUntil: hasta, note: nota.trim() || null, confirm }),
    }).catch(() => null);
    setTrabajando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo armar la asignación"));
      return;
    }
    if (!confirm) {
      setPlan(((await res.json()) as { preview: { plan: Plan } }).preview.plan);
      return;
    }
    const { applied } = (await res.json()) as { applied: { created: number; extended: number } };
    notify.success(
      `Listo: ${applied.created} ${applied.created === 1 ? "acceso nuevo" : "accesos nuevos"} y ${applied.extended} ${applied.extended === 1 ? "extendido" : "extendidos"}`
    );
    setPlan(null);
    onDone();
  }

  const reset = () => setPlan(null);

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4" aria-hidden />
        Asignar a toda una empresa
      </p>
      <p className="text-xs text-muted-foreground">
        Crea un acceso individual para cada persona que la empresa tiene hoy. Quien se sume después no
        lo recibe. A quien ya lo tiene solo se le extiende si la fecha nueva es posterior.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          Empresa
          <Select
            value={empresa}
            onChange={(e) => {
              setEmpresa(e.target.value);
              reset();
            }}
          >
            <option value="">Elegí una empresa…</option>
            {empresas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} ({c.people})
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Acceso hasta
          <Input
            type="date"
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value);
              reset();
            }}
            className="w-40"
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
          Nota (opcional)
          <Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
        </label>
        <Button size="sm" variant="outline" disabled={!empresa || !hasta || trabajando} onClick={() => void enviar(false)}>
          Ver quiénes
        </Button>
      </div>

      {plan && (
        <div className="space-y-2 rounded-md border bg-subtle p-3 text-xs">
          <PlanLista
            titulo={`Lo reciben (${plan.crear.length})`}
            nombres={plan.crear.map((p) => (p.antesQuitado ? `${p.name} (se le había quitado)` : p.name))}
          />
          <PlanLista
            titulo={`Se les extiende (${plan.extender.length})`}
            nombres={plan.extender.map((p) => `${p.name} (tenía hasta el ${formatearDia(p.desde)})`)}
          />
          <PlanLista
            titulo={`Ya lo tienen hasta esa fecha o más (${plan.sinCambios.length})`}
            nombres={plan.sinCambios.map((p) => `${p.name} (hasta el ${formatearDia(p.hasta)})`)}
          />
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={trabajando || plan.crear.length + plan.extender.length === 0}
              onClick={() => void enviar(true)}
            >
              {trabajando ? "Aplicando…" : "Confirmar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanLista({ titulo, nombres }: { titulo: string; nombres: string[] }) {
  if (nombres.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{titulo}</p>
      <p className="text-muted-foreground">{nombres.join(", ")}</p>
    </div>
  );
}
