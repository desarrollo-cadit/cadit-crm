"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MonitorPlay, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { mensajeDeError, PlanLista, type Plan } from "@/components/offline-courses/course-access-panel";
import { formatearDia } from "@/lib/access-expiry";
import { esExtension, type CursoDeEmpresa } from "@/lib/offline-grants";
import { notify } from "@/lib/notify";

/**
 * 045 — Los cursos offline de una empresa, desde `/empresas`.
 *
 * Lee `GET /api/companies/[id]/offline-grants` (`contactos.ver`: Ventas ve
 * quién tiene qué). Con `academico.editar` además asigna un curso a toda la
 * empresa y extiende o quita accesos de a uno, usando las MISMAS rutas de 043
 * que la pantalla del curso: la vista previa y la idempotencia viven ahí.
 */

type Persona = {
  contactId: string;
  name: string;
  grants: { id: string; courseId: string; courseTitle: string; hasta: string; vencido: boolean }[];
};

type Datos = { courses: CursoDeEmpresa[]; people: Persona[] };

export function CompanyOfflineCourses({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [editando, setEditando] = useState<{ grantId: string; desde: string; fecha: string } | null>(null);
  const [asignando, setAsignando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}/offline-grants`).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setError(false);
    setDatos((await res.json()) as Datos);
  }, [companyId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function extender(grantId: string, fecha: string) {
    const res = await fetch(`/api/offline-course-grants/${grantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessUntil: fecha }),
    }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo extender el acceso"));
      return;
    }
    notify.success("Acceso extendido");
    setEditando(null);
    void cargar();
  }

  async function quitar(grantId: string, nombre: string, curso: string) {
    if (!window.confirm(`¿Quitarle «${curso}» a ${nombre}? Deja de ver el curso en este momento.`)) return;
    const res = await fetch(`/api/offline-course-grants/${grantId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo quitar el acceso"));
      return;
    }
    notify.success("Acceso quitado");
    void cargar();
  }

  if (error) {
    return <p className="text-sm text-destructive">No pudimos cargar los cursos offline de la empresa.</p>;
  }
  if (!datos) return <p className="text-sm text-muted-foreground">Cargando cursos offline…</p>;

  return (
    <section aria-label="Cursos offline" className="space-y-3 rounded-md border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MonitorPlay className="h-4 w-4" aria-hidden />
          Cursos offline
        </h3>
        {canEdit && !asignando && datos.people.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAsignando(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Asignar curso offline
          </Button>
        )}
      </div>

      {canEdit && asignando && (
        <AsignarCurso
          companyId={companyId}
          onClose={() => setAsignando(false)}
          onDone={() => {
            setAsignando(false);
            void cargar();
          }}
        />
      )}

      {datos.courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nadie de esta empresa tiene hoy un curso offline por acceso directo.
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {datos.courses.map((c) => (
            <li key={c.courseId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="font-medium">{c.courseTitle}</span>
              <span className="text-muted-foreground">
                {c.personas} {c.personas === 1 ? "persona" : "personas"}
              </span>
              <span className="text-xs text-muted-foreground">
                {c.primeraHasta === c.ultimaHasta
                  ? `hasta el ${formatearDia(c.ultimaHasta)}`
                  : `vence entre el ${formatearDia(c.primeraHasta)} y el ${formatearDia(c.ultimaHasta)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Personas de la empresa ({datos.people.length})
        </h4>
        {datos.people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta empresa no tiene personas asociadas. Se asocian desde la ficha del contacto.
          </p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {datos.people.map((p) => (
              <li key={p.contactId} className="space-y-1 px-3 py-2">
                <Link
                  href={`/contacts/${p.contactId}/legajo`}
                  className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {p.name}
                </Link>
                {p.grants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin cursos offline directos.</p>
                ) : (
                  <ul className="space-y-1">
                    {p.grants.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-center gap-2">
                        <span>{g.courseTitle}</span>
                        <Badge variant={g.vencido ? "destructive" : "secondary"}>
                          {g.vencido ? "Vencido el" : "Hasta el"} {formatearDia(g.hasta)}
                        </Badge>
                        {canEdit && editando?.grantId !== g.id && (
                          <span className="ml-auto flex gap-3 text-xs">
                            <button
                              type="button"
                              className="text-muted-foreground underline"
                              onClick={() => setEditando({ grantId: g.id, desde: g.hasta, fecha: g.hasta })}
                            >
                              Extender
                            </button>
                            <button
                              type="button"
                              className="text-danger underline"
                              onClick={() => void quitar(g.id, p.name, g.courseTitle)}
                            >
                              Quitar
                            </button>
                          </span>
                        )}
                        {canEdit && editando?.grantId === g.id && (
                          <span className="ml-auto flex flex-wrap items-center gap-2">
                            <Input
                              type="date"
                              aria-label={`Nuevo acceso hasta para ${p.name}`}
                              min={editando.desde}
                              value={editando.fecha}
                              onChange={(e) => setEditando({ ...editando, fecha: e.target.value })}
                              className="h-8 w-40"
                            />
                            <Button
                              size="sm"
                              disabled={!esExtension(editando.desde, editando.fecha)}
                              onClick={() => void extender(editando.grantId, editando.fecha)}
                            >
                              Guardar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                              Cancelar
                            </Button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && editando && !esExtension(editando.desde, editando.fecha) && (
          <p className="text-xs text-muted-foreground">
            Elegí una fecha posterior al {formatearDia(editando.desde)}. Para acortar un acceso, cambialo desde la
            pantalla del curso.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Elegir curso de la biblioteca + fecha → vista previa → confirmar. Llama a
 * `POST /api/offline-courses/[id]/grants/company` (043): la misma vista
 * previa, re-planeada al confirmar, idempotente y sin acortar.
 */
function AsignarCurso({
  companyId,
  onClose,
  onDone,
}: {
  companyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cursos, setCursos] = useState<{ id: string; title: string; status: "published" | "draft" }[] | null>(
    null
  );
  const [curso, setCurso] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/offline-courses").catch(() => null);
      if (!res?.ok) {
        setCursos([]);
        return;
      }
      setCursos(((await res.json()) as { courses: NonNullable<typeof cursos> }).courses);
    })();
  }, []);

  async function enviar(confirm: boolean) {
    setTrabajando(true);
    const res = await fetch(`/api/offline-courses/${curso}/grants/company`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, accessUntil: hasta, note: nota.trim() || null, confirm }),
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
    onDone();
  }

  const reset = () => setPlan(null);

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-xs text-muted-foreground">
        Crea un acceso individual para cada persona que la empresa tiene hoy. Quien se sume después no lo recibe. A
        quien ya lo tiene solo se le extiende si la fecha nueva es posterior.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          Curso offline
          <Select
            value={curso}
            disabled={cursos === null}
            onChange={(e) => {
              setCurso(e.target.value);
              reset();
            }}
          >
            <option value="">{cursos === null ? "Cargando…" : "Elegí un curso…"}</option>
            {(cursos ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.status === "draft" ? " (borrador)" : ""}
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
        <Button size="sm" variant="outline" disabled={!curso || !hasta || trabajando} onClick={() => void enviar(false)}>
          Ver quiénes
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
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
          {plan.crear.length + plan.extender.length === 0 && (
            <p className="text-muted-foreground">No hay nada que cambiar: todos ya lo tienen hasta esa fecha o más.</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={trabajando || plan.crear.length + plan.extender.length === 0}
              onClick={() => void enviar(true)}
            >
              {trabajando ? "Aplicando…" : "Confirmar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
