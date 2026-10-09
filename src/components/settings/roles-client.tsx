"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Role = {
  id: string;
  key: string;
  name: string;
  capabilities: string[];
  system: boolean;
  memberCount: number;
  isOwnRole: boolean;
};

/**
 * Rótulos en el idioma de la academia, no en el del código.
 *
 * `cobranza.editar` no le dice nada a quien reparte permisos; "Registrar y
 * anular pagos" sí. La llave técnica igual se muestra chiquita al lado, porque
 * es la que aparece en los mensajes de error.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  "academico.ver": "Ver cursos y cohortes",
  "academico.editar": "Crear y editar cursos y cohortes",
  "asistencia.ver": "Ver asistencia",
  "asistencia.editar": "Tomar asistencia",
  "evaluacion.ver": "Ver evaluaciones",
  "evaluacion.editar": "Cargar y corregir evaluaciones",
  "certificados.emitir": "Emitir certificados",
  "contactos.ver": "Ver contactos",
  "contactos.editar": "Crear y editar contactos",
  "inscripciones.ver": "Ver inscripciones",
  "inscripciones.editar": "Inscribir y editar datos comerciales",
  "cobranza.ver": "Ver cuotas, pagos y finanzas",
  "cobranza.editar": "Registrar y anular pagos",
  "inbox.ver": "Ver conversaciones",
  "inbox.responder": "Responder conversaciones",
  "configuracion.editar": "Configurar la instancia",
  "accesos.gestionar": "Dar acceso al portal y al equipo",
  "alumnos.auditoria": "Ver ingresos y actividad de cada alumno",
  "areas.configurar": "Configurar las áreas de derivación del agente",
};

/**
 * Crear-roles — `areas` se suma a Plataforma: `areas.configurar` (029) no caía
 * en ningún grupo y por eso no aparecía en esta pantalla. Es la misma
 * división que `GRUPOS_CAPACIDADES` de la guía.
 */
const GROUPS: { title: string; match: (c: string) => boolean }[] = [
  { title: "Académico", match: (c) => /^(academico|asistencia|evaluacion|certificados)\./.test(c) },
  { title: "Comercial y financiero", match: (c) => /^(contactos|inscripciones|cobranza)\./.test(c) },
  { title: "Conversaciones", match: (c) => c.startsWith("inbox.") },
  { title: "Plataforma", match: (c) => /^(configuracion|accesos|alumnos|areas)\./.test(c) },
];

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/**
 * La lista de tildes agrupada, la misma para editar un rol y para crearlo.
 *
 * Una capacidad que quien mira no tiene se puede DEJAR tildada (si el rol ya
 * la tenía) pero no tildar: el servidor rechaza otorgar lo que uno no tiene, y
 * dejarlo tildar para después mostrar un error es peor que no ofrecerlo.
 */
function CapabilityChecklist({
  idPrefix,
  capabilities,
  grantable,
  selected,
  disabled,
  onToggle,
}: {
  idPrefix: string;
  capabilities: string[];
  grantable: Set<string>;
  selected: string[];
  disabled?: boolean;
  onToggle: (capability: string, on: boolean) => void;
}) {
  return (
    <>
      {GROUPS.map((group) => {
        const caps = capabilities.filter(group.match);
        if (caps.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {caps.map((c) => {
                const id = `${idPrefix}:${c}`;
                const checked = selected.includes(c);
                const ajena = !grantable.has(c);
                return (
                  <div key={c} className="flex items-start gap-2">
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={checked}
                      disabled={disabled || (ajena && !checked)}
                      onChange={(e) => onToggle(c, e.target.checked)}
                    />
                    <Label htmlFor={id} className="text-sm font-normal leading-tight">
                      {CAPABILITY_LABELS[c] ?? c}
                      <span className="block text-xs text-muted-foreground">
                        {c}
                        {ajena && " · tu rol no la tiene"}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function RolesClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [grantable, setGrantable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Alta de un rol nuevo.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCaps, setNewCaps] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  // Renombre y baja, por fila.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/roles").catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar los roles");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      roles: Role[];
      capabilities: string[];
      grantable?: string[];
    };
    setRoles(data.roles);
    setCapabilities(data.capabilities);
    setGrantable(new Set(data.grantable ?? data.capabilities));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function toggle(role: Role, capability: string, on: boolean) {
    const next = on
      ? [...role.capabilities, capability]
      : role.capabilities.filter((c) => c !== capability);

    // Optimista: marcar el tilde y recién después confirmar. Si el servidor
    // rechaza, `refetch` devuelve el estado real y el mensaje explica por qué.
    setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, capabilities: next } : r)));
    setSaving(role.id);
    setSaved(null);

    const res = await fetch(`/api/settings/roles/${role.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capabilities: next }),
    }).catch(() => null);

    setSaving(null);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo guardar el rol"));
      void refetch();
      return;
    }
    setError(null);
    setSaved(role.id);
  }

  async function create() {
    setSaving("nuevo");
    setCreateError(null);
    const res = await fetch("/api/settings/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), capabilities: newCaps }),
    }).catch(() => null);
    setSaving(null);
    if (!res?.ok) {
      setCreateError(await mensajeDeError(res, "No se pudo crear el rol"));
      return;
    }
    setCreating(false);
    setNewName("");
    setNewCaps([]);
    void refetch();
  }

  async function rename(role: Role, name: string) {
    setSaving(role.id);
    setRowError(null);
    const res = await fetch(`/api/settings/roles/${role.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    setSaving(null);
    if (!res?.ok) {
      setRowError({ id: role.id, message: await mensajeDeError(res, "No se pudo renombrar el rol") });
      return;
    }
    setRenaming(null);
    setSaved(role.id);
    void refetch();
  }

  async function remove(role: Role) {
    setSaving(role.id);
    setRowError(null);
    const res = await fetch(`/api/settings/roles/${role.id}`, { method: "DELETE" }).catch(
      () => null
    );
    setSaving(null);
    setConfirmDelete(null);
    if (!res?.ok) {
      setRowError({ id: role.id, message: await mensajeDeError(res, "No se pudo borrar el rol") });
      return;
    }
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sinSembrar = roles.some((r) => r.id.startsWith("sin-sembrar:"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Roles y permisos</h3>
          <p className="text-sm text-muted-foreground">
            Qué puede hacer cada rol. Los cambios se aplican a todas las cuentas que
            tengan ese rol, la próxima vez que inicien sesión.
          </p>
        </div>
        {!sinSembrar && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo rol
          </Button>
        )}
      </div>

      {sinSembrar && (
        <p className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
          Estos roles todavía no están guardados en la base: se muestran los que
          rigen por código. Corré las migraciones para poder editarlos.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo rol</CardTitle>
            <CardDescription>
              Elegí un nombre que se entienda en la pantalla de Equipo y tildá solo lo que
              ese puesto necesita. Después lo asignás al dar de alta una cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="role-new-name">Nombre</Label>
              <Input
                id="role-new-name"
                value={newName}
                maxLength={60}
                placeholder="Coordinación académica"
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <CapabilityChecklist
              idPrefix="nuevo"
              capabilities={capabilities}
              grantable={grantable}
              selected={newCaps}
              onToggle={(c, on) =>
                setNewCaps((cs) => (on ? [...cs, c] : cs.filter((x) => x !== c)))
              }
            />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving === "nuevo" || newName.trim().length < 2}
                onClick={() => void create()}
              >
                {saving === "nuevo" ? "Creando…" : "Crear rol"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {roles.map((role) => {
        const persistido = !role.id.startsWith("sin-sembrar:");
        const renombrando = renaming?.id === role.id;
        return (
          <Card key={role.id}>
            <CardHeader>
              {renombrando ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`role-name-${role.id}`}>Nombre del rol</Label>
                    <Input
                      id={`role-name-${role.id}`}
                      value={renaming.name}
                      maxLength={60}
                      onChange={(e) => setRenaming({ id: role.id, name: e.target.value })}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={saving === role.id || renaming.name.trim().length < 2}
                    onClick={() => void rename(role, renaming.name)}
                  >
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{role.name}</CardTitle>
                  {role.system ? (
                    <Badge variant="outline">{role.key}</Badge>
                  ) : (
                    <Badge variant="secondary">Personalizado</Badge>
                  )}
                  {role.isOwnRole && <Badge>Tu rol</Badge>}
                  {saving === role.id && (
                    <span className="text-xs text-muted-foreground">Guardando…</span>
                  )}
                  {saved === role.id && saving !== role.id && (
                    <span className="text-xs text-muted-foreground">Guardado</span>
                  )}
                  {persistido && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRenaming({ id: role.id, name: role.name })}
                      >
                        <Pencil className="h-4 w-4" /> Renombrar
                      </Button>
                      {!role.system && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(role.id)}
                        >
                          <Trash2 className="h-4 w-4" /> Borrar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <CardDescription>
                {role.memberCount === 0
                  ? "Ninguna cuenta tiene este rol todavía."
                  : role.memberCount === 1
                    ? "1 cuenta tiene este rol."
                    : `${role.memberCount} cuentas tienen este rol.`}
              </CardDescription>
              {/* Borrar es definitivo: se confirma en la tarjeta, con lo que
                  implica dicho, y no con un clic suelto. */}
              {confirmDelete === role.id && (
                <div className="mt-2 space-y-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
                  <p>
                    {role.memberCount > 0
                      ? `«${role.name}» lo tienen ${role.memberCount === 1 ? "1 cuenta" : `${role.memberCount} cuentas`}: asignales otro rol desde Equipo antes de borrarlo.`
                      : `¿Borrar el rol «${role.name}»? No se puede deshacer.`}
                  </p>
                  <div className="flex gap-2">
                    {role.memberCount === 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving === role.id}
                        onClick={() => void remove(role)}
                      >
                        Sí, borrar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      {role.memberCount === 0 ? "Cancelar" : "Entendido"}
                    </Button>
                  </div>
                </div>
              )}
              {rowError?.id === role.id && (
                <p className="text-sm text-destructive">{rowError.message}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <CapabilityChecklist
                idPrefix={role.id}
                capabilities={capabilities}
                grantable={grantable}
                selected={role.capabilities}
                disabled={!persistido}
                onToggle={(c, on) => void toggle(role, c, on)}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
