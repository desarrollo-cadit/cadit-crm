"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatearDia } from "@/lib/access-expiry";
import { notify } from "@/lib/notify";

/**
 * 043 — Los accesos DIRECTOS de una persona a cursos offline (sin
 * inscripción), en su legajo: ver, dar, extender o acortar, y quitar.
 *
 * Con `academico.editar` se ofrecen las acciones; la barrera real son las
 * rutas. Quitar se MARCA (queda en la lista como "Quitado").
 */

export type ContactGrantDto = {
  id: string;
  courseId: string;
  courseTitle: string;
  hasta: string;
  vencido: boolean;
  note: string | null;
  viaCompanyName: string | null;
  createdAt: string;
  createdByName: string | null;
  revokedAt: string | null;
};

async function mensajeDeError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function DirectGrantsSection({
  contactId,
  grants,
  canEdit,
  onChanged,
}: {
  contactId: string;
  grants: ContactGrantDto[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [cursos, setCursos] = useState<{ id: string; title: string }[]>([]);
  const [curso, setCurso] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; fecha: string } | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    void (async () => {
      const res = await fetch("/api/offline-courses").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { courses: { id: string; title: string }[] };
      setCursos(body.courses);
    })();
  }, [canEdit]);

  async function dar() {
    setEnviando(true);
    const res = await fetch(`/api/offline-courses/${curso}/grants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, accessUntil: hasta, note: nota.trim() || null }),
    }).catch(() => null);
    setEnviando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo dar el acceso"));
      return;
    }
    notify.success("Acceso guardado");
    setCurso("");
    setHasta("");
    setNota("");
    onChanged();
  }

  async function cambiarFecha(id: string, fecha: string) {
    const res = await fetch(`/api/offline-course-grants/${id}`, {
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
    onChanged();
  }

  async function quitar(g: ContactGrantDto) {
    if (!window.confirm(`¿Quitarle el acceso a «${g.courseTitle}»? Deja de verlo en el portal en este momento.`)) {
      return;
    }
    const res = await fetch(`/api/offline-course-grants/${g.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo quitar el acceso"));
      return;
    }
    notify.success("Acceso quitado");
    onChanged();
  }

  const activos = grants.filter((g) => !g.revokedAt);
  const quitados = grants.filter((g) => g.revokedAt);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Library className="h-4 w-4" />
        Cursos offline con acceso directo ({activos.length})
      </h2>
      <p className="text-xs text-muted-foreground">
        Un acceso directo es de la persona, no de una inscripción: vence solo en su fecha. Los cursos
        que le llegan por una cohorte se ven y se cambian desde la cohorte.
      </p>

      {activos.length === 0 && (
        <p className="text-sm text-muted-foreground">No tiene cursos offline asignados en forma directa.</p>
      )}

      {activos.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {activos.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="font-medium">{g.courseTitle}</span>
              {g.vencido ? (
                <Badge variant="destructive">Vencido el {formatearDia(g.hasta)}</Badge>
              ) : (
                <Badge variant="secondary">Hasta el {formatearDia(g.hasta)}</Badge>
              )}
              {g.viaCompanyName && (
                <span className="text-xs text-muted-foreground">por la empresa {g.viaCompanyName}</span>
              )}
              {g.note && <span className="text-xs text-muted-foreground">· {g.note}</span>}
              <span className="text-xs text-muted-foreground">
                · Lo dio {g.createdByName ?? "alguien que ya no está"} el{" "}
                {new Date(g.createdAt).toLocaleDateString("es-UY")}
              </span>
              {canEdit && editando?.id !== g.id && (
                <span className="ml-auto flex gap-3 text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={() => setEditando({ id: g.id, fecha: g.hasta })}
                  >
                    Cambiar fecha
                  </button>
                  <button type="button" className="text-danger underline" onClick={() => void quitar(g)}>
                    Quitar
                  </button>
                </span>
              )}
              {editando?.id === g.id && (
                <span className="ml-auto flex items-center gap-2">
                  <Input
                    type="date"
                    aria-label="Acceso hasta"
                    value={editando.fecha}
                    onChange={(e) => setEditando({ id: g.id, fecha: e.target.value })}
                    className="h-8 w-40"
                  />
                  <Button
                    size="sm"
                    disabled={!editando.fecha}
                    onClick={() => void cambiarFecha(g.id, editando.fecha)}
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

      {quitados.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Accesos quitados ({quitados.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {quitados.map((g) => (
              <li key={g.id}>
                {g.courseTitle} · quitado el {new Date(g.revokedAt!).toLocaleDateString("es-UY")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <label className="flex flex-col gap-1 text-xs">
            Curso offline
            <Select value={curso} onChange={(e) => setCurso(e.target.value)} className="w-64">
              <option value="">Elegí un curso…</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Acceso hasta
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Nota (opcional)
            <Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} className="w-56" />
          </label>
          <Button size="sm" disabled={!curso || !hasta || enviando} onClick={() => void dar()}>
            {enviando ? "Guardando…" : "Dar acceso"}
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * 043 — Portal para quien no tiene inscripción (solo accesos directos). Mismo
 * trato que el roster: la contraseña temporal se muestra una vez, y si el
 * correo falla se dice.
 */
export function ContactPortalAccess({ contactId }: { contactId: string }) {
  const [estado, setEstado] = useState<{
    link: { suspendedAt: string | null; invitationEmailSentAt: string | null } | null;
    blockedReason: string | null;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ password: string | null; emailError: string | null } | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/portal-access`).catch(() => null);
    if (res?.ok) setEstado(await res.json());
  }, [contactId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function dar() {
    setEnviando(true);
    const res = await fetch(`/api/contacts/${contactId}/portal-access`, { method: "POST" }).catch(() => null);
    setEnviando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo dar el acceso al portal"));
      return;
    }
    const body = (await res.json()) as { temporaryPassword?: string | null; emailError?: string | null };
    setResultado({ password: body.temporaryPassword ?? null, emailError: body.emailError ?? null });
    void cargar();
  }

  if (!estado) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {estado.link ? (
        <span className="text-muted-foreground">
          {estado.link.suspendedAt ? "Acceso al portal suspendido." : "Tiene acceso al portal."}
        </span>
      ) : estado.blockedReason ? (
        <span className="text-muted-foreground">{estado.blockedReason}</span>
      ) : (
        <Button variant="outline" size="sm" disabled={enviando} onClick={() => void dar()}>
          <KeyRound className="h-4 w-4" />
          {enviando ? "Dando acceso…" : "Dar acceso al portal"}
        </Button>
      )}
      {resultado?.password && (
        <span className="rounded border border-warning-border bg-warning-soft px-2 py-1">
          {resultado.emailError
            ? `Creamos el acceso, pero el correo no se pudo enviar (${resultado.emailError}). `
            : "Acceso creado y correo enviado. "}
          Contraseña temporal:{" "}
          <code className="font-mono font-semibold">{resultado.password}</code> (no se va a volver a
          mostrar).
        </span>
      )}
    </div>
  );
}
