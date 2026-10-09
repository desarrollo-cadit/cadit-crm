"use client";

import { useCallback, useEffect, useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Member = {
  id: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
  isSelf?: boolean;
  /** 030 (addendum) — También es profesor con acceso al portal. */
  isTeacher?: boolean;
};

/** Crear-roles — Lo que devuelve `/api/settings/team/roles`. */
type AssignableRole = { id: string; key: string; name: string; assignable: boolean };

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  // 005 (DV-001) — rol funcional de la cuenta nueva: acceso completo
  // (ventas/coordinación) o restringido (soporte, sin datos financieros).
  /**
   * 012 (T029) — La llave del rol y la lista REAL de la organización.
   *
   * Antes era un enum fijo (`member` / `soporte`) escrito acá adentro. Con los
   * roles editables desde `/settings/roles`, una lista quemada en el
   * componente queda vieja en cuanto alguien crea o renombra uno — y ofrecer
   * un rol que no existe da de alta cuentas sin permisos mapeados, que por el
   * respaldo en código terminan pudiendo TODO.
   */
  const [roleKey, setRoleKey] = useState("");
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [created, setCreated] = useState<
    { email: string; password: string; attached: false } | { email: string; attached: true } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { members: Member[] };
    setMembers(data.members);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
    // Los roles que EXISTEN, para no ofrecer ninguno que no esté mapeado.
    // Crear-roles — Sale de `/api/settings/team/roles`, que pide la misma
    // capacidad que esta pantalla (`accesos.gestionar`). Antes se leía de la
    // pantalla de Roles, que pide `configuracion.editar`: quien gestionaba
    // accesos sin configurar veía el selector vacío.
    void (async () => {
      const res = await fetch("/api/settings/team/roles").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { roles: AssignableRole[] };
      setRoles(data.roles);
      setRoleKey((actual) => actual || data.roles.find((r) => r.assignable)?.key || "");
    })();
  }, [refetch]);

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword, roleKey }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la cuenta");
      return;
    }
    const ok = (await res.json().catch(() => null)) as { attached?: boolean } | null;
    setCreated(ok?.attached ? { email, attached: true } : { email, password: tempPassword, attached: false });
    setName("");
    setEmail("");
    setTempPassword("");
    setRoleKey(roles.find((r) => r.assignable)?.key ?? "");
    void refetch();
  }

  /**
   * 030 (addendum) — Quitar del equipo borra SOLO la membresía: si la persona
   * es profesor, sigue entrando al portal con su misma contraseña.
   */
  async function removeFromTeam(member: Member) {
    const aviso = member.isTeacher
      ? `¿Quitar a ${member.name} del equipo? Va a seguir entrando al portal como profesor, con su misma contraseña.`
      : `¿Quitar a ${member.name} del equipo? No va a poder entrar al panel.`;
    if (!window.confirm(aviso)) return;
    setChanging(member.id);
    setRowError(null);
    const res = await fetch(`/api/settings/team/${member.id}`, { method: "DELETE" }).catch(() => null);
    setChanging(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setRowError({ id: member.id, message: data?.error?.message ?? "No se pudo quitar del equipo" });
      return;
    }
    void refetch();
  }

  /** Crear-roles — Cambia el rol de una cuenta existente. */
  async function changeRole(member: Member, roleId: string) {
    setChanging(member.id);
    setRowError(null);
    const res = await fetch(`/api/settings/team/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId }),
    }).catch(() => null);
    setChanging(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setRowError({ id: member.id, message: data?.error?.message ?? "No se pudo cambiar el rol" });
      return;
    }
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de equipo</CardTitle>
          <CardDescription>
            Sin correos ni invitaciones: comparte tú mismo la contraseña
            temporal con tu compañero (se muestra UNA sola vez).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-role">Rol</Label>
            <select
              id="team-role"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key} disabled={!r.assignable}>
                  {r.assignable ? r.name : `${r.name} (tiene permisos que tu rol no tiene)`}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Qué puede hacer cada rol se configura en{" "}
              <a href="/settings/roles" className="underline">
                Roles
              </a>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                id="team-password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="mínimo 8 caracteres"
              />
              <Button variant="outline" onClick={generatePassword}>
                Generar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Si el correo es de un profesor con acceso al portal, dejala vacía: se usa su misma
              cuenta y su contraseña no cambia.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && created.attached && (
            <div className="rounded-md border border-success-border bg-success-soft p-3 text-sm" data-team-attached>
              <p className="font-medium text-success">Listo ✓</p>
              <p className="mt-1 text-success">
                <code>{created.email}</code> ya era profesor y ahora también es parte del equipo.
                Entra con su misma contraseña y cambia de vista desde su cuenta.
              </p>
            </div>
          )}
          {created && !created.attached && (
            <div className="rounded-md border border-success-border bg-success-soft p-3 text-sm">
              <p className="font-medium text-success">Cuenta creada ✓</p>
              <p className="mt-1 text-success">
                Comparte estos datos ahora (no se volverán a mostrar):
                <br />
                <code>{created.email}</code> · contraseña{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving ||
              !name.trim() ||
              !email.trim() ||
              (tempPassword.length > 0 && tempPassword.length < 8)
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Creando…" : "Crear cuenta"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Miembros
        </p>
        {loading && (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        )}
        {!loading && members.map((m) => (
          <div key={m.id} className="space-y-1 rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <ContactAvatar name={m.name} seed={m.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.isTeacher && <Badge variant="outline">También profesor</Badge>}
              {/* 012 (T029) — El rótulo sale de la tabla `role`, no de un
                  `if` con nombres quemados: si la dueña renombra un rol desde
                  Roles, acá se ve el nombre nuevo. Si el rol no está sembrado,
                  se muestra la llave cruda antes que inventar un rótulo. */}
              {/* Crear-roles — Se cambia desde la fila. La propia no ofrece el
                  selector (tu rol lo cambia otra persona), y un rol que excede
                  al tuyo aparece pero no se puede elegir. */}
              {m.isSelf || roles.length === 0 || !roles.some((r) => r.key === m.role) ? (
                <Badge variant="secondary">
                  {roles.find((r) => r.key === m.role)?.name ?? m.role}
                </Badge>
              ) : (
                <select
                  aria-label={`Rol de ${m.name}`}
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                  value={roles.find((r) => r.key === m.role)?.id ?? ""}
                  disabled={changing === m.id}
                  onChange={(e) => void changeRole(m, e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.assignable && r.key !== m.role}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
              {!m.isSelf && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Quitar a ${m.name} del equipo`}
                  title="Quitar del equipo"
                  disabled={changing === m.id}
                  onClick={() => void removeFromTeam(m)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {rowError?.id === m.id && (
              <p className="text-xs text-destructive">{rowError.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
