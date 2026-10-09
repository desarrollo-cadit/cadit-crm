"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Pencil, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";

type Seller = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  archived: boolean;
};

type TeamMember = { userId: string; name: string; email: string };

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/**
 * 2026-10-06 — Los vendedores de la academia, usen o no el panel.
 *
 * Un vendedor se archiva, no se borra: deja de ofrecerse para ventas nuevas,
 * pero sigue en las que hizo y en el reporte de Finanzas. La cuenta del panel
 * es opcional y sólo se ofrece a quien puede ver el equipo (`accesos.gestionar`);
 * sin esa capacidad, la pantalla funciona igual sin ese campo.
 */
export function SellersClient() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/sellers").catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const data = (await res.json()) as { sellers: Seller[] };
    setSellers(data.sellers);
  }, []);

  useEffect(() => {
    void refetch();
    void (async () => {
      const res = await fetch("/api/settings/team").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { members: TeamMember[] };
      setTeam(data.members);
    })();
  }, [refetch]);

  async function create() {
    setSaving(true);
    const res = await fetch("/api/sellers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim() || null,
        userId: userId || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No pudimos guardar el vendedor. Podés intentarlo otra vez en un momento."));
      return;
    }
    notify.success("Vendedor agregado.");
    setName("");
    setEmail("");
    setUserId("");
    void refetch();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/sellers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No pudimos guardar el cambio. Podés intentarlo otra vez en un momento."));
      return false;
    }
    void refetch();
    return true;
  }

  const enEquipo = new Map((team ?? []).map((m) => [m.userId, m.name]));
  const yaVinculados = new Set(sellers.map((s) => s.userId).filter(Boolean));
  const activos = sellers.filter((s) => !s.archived);
  const archivados = sellers.filter((s) => s.archived);

  function fila(s: Seller) {
    const editandoEste = editing?.id === s.id;
    return (
      <div key={s.id} className="space-y-2 rounded-lg border bg-card px-4 py-3">
        {editandoEste ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`seller-name-${s.id}`}>Nombre</Label>
              <Input
                id={`seller-name-${s.id}`}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`seller-email-${s.id}`}>Correo (opcional)</Label>
              <Input
                id={`seller-email-${s.id}`}
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                size="sm"
                disabled={!editing.name.trim()}
                onClick={async () => {
                  const ok = await patch(s.id, {
                    name: editing.name.trim(),
                    email: editing.email.trim() || null,
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.email ?? "Sin correo"}
                {s.userId && (
                  <> · Cuenta del panel{enEquipo.get(s.userId) ? `: ${enEquipo.get(s.userId)}` : ""}</>
                )}
              </p>
            </div>
            {s.archived && <Badge variant="secondary">Archivado</Badge>}
            {!s.archived && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing({ id: s.id, name: s.name, email: s.email ?? "" })}
              >
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void patch(s.id, { archived: !s.archived })}
            >
              {s.archived ? (
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Agregar vendedor</CardTitle>
          <CardDescription>
            Toda inscripción en una cohorte es una venta y lleva vendedor. Se puede
            cargar a quien vende aunque no use el sistema; el correo es opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seller-name">Nombre</Label>
              <Input id="seller-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller-email">Correo (opcional)</Label>
              <Input
                id="seller-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          {team && team.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="seller-user">Cuenta del panel (opcional)</Label>
              <Select id="seller-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">No usa el panel</option>
                {team
                  .filter((m) => !yaVinculados.has(m.userId))
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} · {m.email}
                    </option>
                  ))}
              </Select>
            </div>
          )}
          <Button disabled={saving || !name.trim()} onClick={() => void create()}>
            <UserPlus className="h-4 w-4" />
            {saving ? "Guardando…" : "Agregar vendedor"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vendedores activos
        </p>
        {loading && (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        )}
        {loadError && (
          <p className="text-sm text-destructive">
            No pudimos cargar la lista de vendedores. Podés recargar la página en un momento.
          </p>
        )}
        {!loading && !loadError && activos.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay vendedores cargados.</p>
        )}
        {activos.map(fila)}
      </div>

      {archivados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Archivados
          </p>
          <p className="text-xs text-muted-foreground">
            No se ofrecen para ventas nuevas, pero siguen en las ventas que hicieron y en
            el reporte de Finanzas.
          </p>
          {archivados.map(fila)}
        </div>
      )}
    </div>
  );
}
