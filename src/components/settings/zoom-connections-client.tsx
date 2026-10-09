"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Link2, Pencil, PlugZap, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ConnectionRoom = { id: string; name: string; zoomUserId: string; zoomUserEmail: string | null };

type Connection = {
  id: string;
  name: string;
  accountId: string;
  clientId: string;
  clientSecretLast4: string;
  status: "sin_probar" | "ok" | "error";
  lastError: string | null;
  lastTestedAt: string | null;
  archived: boolean;
  rooms: ConnectionRoom[];
};

type ZoomUser = { id: string; email: string; displayName: string };

export type ActiveRoom = { id: string; name: string };

const ESTADO: Record<Connection["status"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  ok: { label: "Conectada", variant: "success" },
  sin_probar: { label: "Sin probar", variant: "warning" },
  error: { label: "Con error", variant: "destructive" },
};

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/** `credenciales_invalidas: Zoom rechazó…` → solo la parte legible. */
const legible = (lastError: string) => lastError.replace(/^[a-z_]+:\s*/, "");

const vacio = { name: "", accountId: "", clientId: "", clientSecret: "" };

/**
 * 030 US4 — Conexiones de Zoom y qué usuario de Zoom hospeda cada aula.
 *
 * Una conexión es una app Server-to-Server OAuth de UNA cuenta de Zoom; puede
 * cubrir uno o muchos usuarios. Por eso sirve igual si la academia tiene una
 * organización de Zoom (una conexión, cinco usuarios) o cinco cuentas sueltas
 * (cinco conexiones, un usuario cada una).
 *
 * El Client Secret no vuelve nunca del servidor: se muestra `••••` y sus
 * últimos 4. Al editar, el campo vacío conserva el que ya estaba.
 */
export function ZoomConnectionsClient({ rooms }: { rooms: ActiveRoom[] }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [form, setForm] = useState(vacio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<(typeof vacio & { id: string }) | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; text: string; tone: "ok" | "error" } | null>(null);
  const [users, setUsers] = useState<Record<string, ZoomUser[]>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/zoom/connections").catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const data = (await res.json()) as { connections: Connection[] };
    setConnections(data.connections);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/zoom/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        accountId: form.accountId.trim(),
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No pudimos guardar la conexión. Podés intentarlo otra vez en un momento."));
      return;
    }
    setForm(vacio);
    void refetch();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setRowMsg(null);
    const res = await fetch(`/api/settings/zoom/connections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      setRowMsg({
        id,
        tone: "error",
        text: await mensajeDeError(res, "No pudimos guardar el cambio. Podés intentarlo otra vez en un momento."),
      });
      return false;
    }
    void refetch();
    return true;
  }

  async function probar(id: string) {
    setTesting(id);
    setRowMsg(null);
    const res = await fetch(`/api/settings/zoom/connections/${id}/test`, { method: "POST" }).catch(() => null);
    setTesting(null);
    if (!res?.ok) {
      setRowMsg({ id, tone: "error", text: await mensajeDeError(res, "No pudimos probar la conexión.") });
      return;
    }
    const data = (await res.json()) as
      | { ok: true; users: ZoomUser[] }
      | { ok: false; error: string; message: string };
    if (data.ok) {
      setUsers((u) => ({ ...u, [id]: data.users }));
      setRowMsg({
        id,
        tone: "ok",
        text:
          data.users.length === 1
            ? "Conexión correcta: Zoom devolvió 1 usuario."
            : `Conexión correcta: Zoom devolvió ${data.users.length} usuarios.`,
      });
    } else {
      setRowMsg({ id, tone: "error", text: data.message });
    }
    void refetch();
  }

  async function vincular(roomId: string, connectionId: string, zoomUserId: string) {
    setRowMsg(null);
    const user = (users[connectionId] ?? []).find((u) => u.id === zoomUserId);
    const res = await fetch(`/api/settings/zoom/rooms/${roomId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        zoomUserId
          ? { connectionId, zoomUserId, ...(user ? { zoomUserEmail: user.email } : {}) }
          : { connectionId: null }
      ),
    }).catch(() => null);
    if (!res?.ok) {
      setRowMsg({
        id: connectionId,
        tone: "error",
        text: await mensajeDeError(res, "No pudimos vincular el aula. Podés intentarlo otra vez en un momento."),
      });
      return;
    }
    void refetch();
  }

  /** Aula → a qué conexión y usuario está vinculada hoy (solo aulas activas). */
  const vinculo = new Map<string, { connectionId: string; connectionName: string; zoomUserId: string }>();
  for (const c of connections) {
    for (const r of c.rooms) {
      vinculo.set(r.id, { connectionId: c.id, connectionName: c.name, zoomUserId: r.zoomUserId });
    }
  }

  function aulas(c: Connection) {
    const disponibles = users[c.id];
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aulas</p>
        {rooms.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay aulas activas. Se crean desde Académico › Aulas.
          </p>
        )}
        {!disponibles && rooms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Probá la conexión para elegir qué usuario de Zoom hospeda cada aula.
          </p>
        )}
        {rooms.map((room) => {
          const v = vinculo.get(room.id);
          const deEsta = v?.connectionId === c.id;
          const actual = deEsta ? v.zoomUserId : "";
          const etiquetaActual = c.rooms.find((r) => r.id === room.id);
          return (
            <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
              <span className="min-w-32 text-sm font-medium">{room.name}</span>
              {disponibles && !c.archived ? (
                <Select
                  aria-label={`Usuario de Zoom de ${room.name}`}
                  className="w-72"
                  value={actual}
                  onChange={(e) => void vincular(room.id, c.id, e.target.value)}
                >
                  <option value="">Sin vincular a esta conexión</option>
                  {disponibles.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} · {u.email}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {deEsta
                    ? (etiquetaActual?.zoomUserEmail ?? etiquetaActual?.zoomUserId ?? "")
                    : "Sin vincular a esta conexión"}
                </span>
              )}
              {v && !deEsta && (
                <span className="text-xs text-muted-foreground">Vinculada a {v.connectionName}</span>
              )}
              {deEsta && <Badge variant="success">Se sincroniza</Badge>}
            </div>
          );
        })}
      </div>
    );
  }

  function tarjeta(c: Connection) {
    const estado = ESTADO[c.status];
    const editandoEsta = editing?.id === c.id;
    return (
      <Card key={c.id}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{c.name}</CardTitle>
            <Badge variant={estado.variant}>{estado.label}</Badge>
            {c.archived && <Badge variant="secondary">Archivada</Badge>}
          </div>
          <CardDescription>
            Account ID {c.accountId} · Client ID {c.clientId} · Client Secret ••••{c.clientSecretLast4}
            {c.lastTestedAt && <> · Probada el {new Date(c.lastTestedAt).toLocaleString("es-UY")}</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {c.status === "error" && c.lastError && (
            <p className="text-sm text-destructive">{legible(c.lastError)}</p>
          )}

          {editandoEsta ? (
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["name", "Nombre"],
                  ["accountId", "Account ID"],
                  ["clientId", "Client ID"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`zoom-${k}-${c.id}`}>{label}</Label>
                  <Input
                    id={`zoom-${k}-${c.id}`}
                    value={editing[k]}
                    onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor={`zoom-secret-${c.id}`}>Client Secret</Label>
                <Input
                  id={`zoom-secret-${c.id}`}
                  type="password"
                  autoComplete="new-password"
                  placeholder={`••••${c.clientSecretLast4} (dejalo vacío para conservarlo)`}
                  value={editing.clientSecret}
                  onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button
                  size="sm"
                  disabled={!editing.name.trim() || !editing.accountId.trim() || !editing.clientId.trim()}
                  onClick={async () => {
                    const ok = await patch(c.id, {
                      name: editing.name.trim(),
                      accountId: editing.accountId.trim(),
                      clientId: editing.clientId.trim(),
                      clientSecret: editing.clientSecret.trim(),
                    });
                    if (ok) setEditing(null);
                  }}
                >
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!c.archived && (
                <Button size="sm" disabled={testing === c.id} onClick={() => void probar(c.id)}>
                  <PlugZap className="h-4 w-4" />
                  {testing === c.id ? "Probando…" : "Probar"}
                </Button>
              )}
              {!c.archived && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: c.id,
                      name: c.name,
                      accountId: c.accountId,
                      clientId: c.clientId,
                      clientSecret: "",
                    })
                  }
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void patch(c.id, { archived: !c.archived })}>
                {c.archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" /> Reactivar
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" /> Archivar
                  </>
                )}
              </Button>
            </div>
          )}

          {rowMsg?.id === c.id && (
            <p className={rowMsg.tone === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
              {rowMsg.text}
            </p>
          )}

          {c.archived ? (
            <p className="text-sm text-muted-foreground">
              Una conexión archivada no se sincroniza. Sus grabaciones siguen en Grabaciones.
            </p>
          ) : (
            aulas(c)
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Conectar una cuenta de Zoom
          </CardTitle>
          <CardDescription>
            Creá una app Server-to-Server OAuth en el Marketplace de Zoom con permisos de solo
            lectura (usuarios y grabaciones en la nube) y pegá acá sus tres datos. Si las cuentas
            de la academia son una sola organización de Zoom, alcanza con una conexión; si son
            cuentas separadas, cargá una por cuenta. El CRM solo lee: no crea ni borra nada en Zoom.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="zoom-name">Nombre</Label>
              <Input
                id="zoom-name"
                placeholder="Zoom academia"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoom-account">Account ID</Label>
              <Input
                id="zoom-account"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoom-client">Client ID</Label>
              <Input
                id="zoom-client"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoom-secret">Client Secret</Label>
              <Input
                id="zoom-secret"
                type="password"
                autoComplete="new-password"
                value={form.clientSecret}
                onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            disabled={
              saving ||
              !form.name.trim() ||
              !form.accountId.trim() ||
              !form.clientId.trim() ||
              form.clientSecret.trim().length < 8
            }
            onClick={() => void create()}
          >
            <Plus className="h-4 w-4" />
            {saving ? "Guardando…" : "Agregar conexión"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {loading && (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
        {loadError && (
          <p className="text-sm text-destructive">
            No pudimos cargar las conexiones de Zoom. Podés recargar la página en un momento.
          </p>
        )}
        {!loading && !loadError && connections.length === 0 && (
          <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Todavía no hay cuentas de Zoom conectadas. Sin conexión, el CRM funciona igual: las
            grabaciones se cargan a mano en cada clase.
          </p>
        )}
        {connections.filter((c) => !c.archived).map(tarjeta)}
        {connections.some((c) => c.archived) && (
          <>
            <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Archivadas
            </p>
            {connections.filter((c) => c.archived).map(tarjeta)}
          </>
        )}
      </div>
    </div>
  );
}
