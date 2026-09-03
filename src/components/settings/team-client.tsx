"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
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
};

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
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([]);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
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
    void (async () => {
      const res = await fetch("/api/settings/roles").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { roles: { key: string; name: string }[] };
      setRoles(data.roles);
      setRoleKey((actual) => actual || data.roles[0]?.key || "");
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
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setTempPassword("");
    setRoleKey(roles[0]?.key ?? "");
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
                <option key={r.key} value={r.key}>
                  {r.name}
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
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
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
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
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
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <ContactAvatar name={m.name} seed={m.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            {/* 012 (T029) — El rótulo sale de la tabla `role`, no de un
                `if` con nombres quemados: si la dueña renombra un rol desde
                Roles, acá se ve el nombre nuevo. Si el rol no está sembrado,
                se muestra la llave cruda antes que inventar un rótulo. */}
            <Badge variant="secondary">
              {roles.find((r) => r.key === m.role)?.name ?? m.role}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
