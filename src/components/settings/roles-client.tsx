"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
};

const GROUPS: { title: string; match: (c: string) => boolean }[] = [
  { title: "Académico", match: (c) => /^(academico|asistencia|evaluacion|certificados)\./.test(c) },
  { title: "Comercial y financiero", match: (c) => /^(contactos|inscripciones|cobranza)\./.test(c) },
  { title: "Conversaciones", match: (c) => c.startsWith("inbox.") },
  { title: "Plataforma", match: (c) => /^(configuracion|accesos)\./.test(c) },
];

export function RolesClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/roles").catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar los roles");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { roles: Role[]; capabilities: string[] };
    setRoles(data.roles);
    setCapabilities(data.capabilities);
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
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar el rol");
      void refetch();
      return;
    }
    setError(null);
    setSaved(role.id);
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
      <div>
        <h3 className="font-semibold">Roles y permisos</h3>
        <p className="text-sm text-muted-foreground">
          Qué puede hacer cada rol. Los cambios se aplican a todas las cuentas que
          tengan ese rol, la próxima vez que inicien sesión.
        </p>
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

      {roles.map((role) => (
        <Card key={role.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{role.name}</CardTitle>
              <Badge variant="outline">{role.key}</Badge>
              {role.isOwnRole && <Badge>Tu rol</Badge>}
              {saving === role.id && (
                <span className="text-xs text-muted-foreground">Guardando…</span>
              )}
              {saved === role.id && saving !== role.id && (
                <span className="text-xs text-muted-foreground">Guardado</span>
              )}
            </div>
            <CardDescription>
              {role.memberCount === 0
                ? "Ninguna cuenta tiene este rol todavía."
                : role.memberCount === 1
                  ? "1 cuenta tiene este rol."
                  : `${role.memberCount} cuentas tienen este rol.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      const id = `${role.id}:${c}`;
                      const checked = role.capabilities.includes(c);
                      return (
                        <div key={c} className="flex items-start gap-2">
                          <Checkbox
                            id={id}
                            className="mt-0.5"
                            checked={checked}
                            disabled={role.id.startsWith("sin-sembrar:")}
                            onChange={(e) => void toggle(role, c, e.target.checked)}
                          />
                          <Label htmlFor={id} className="text-sm font-normal leading-tight">
                            {CAPABILITY_LABELS[c] ?? c}
                            <span className="block text-xs text-muted-foreground">{c}</span>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
