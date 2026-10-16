"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";

type Miembro = { userId: string; name: string; email: string };
type Elegido = { soporte: string[]; coordinacion: string[] };
type Rol = keyof Elegido;

const ROLES: { rol: Rol; titulo: string; descripcion: string }[] = [
  {
    rol: "soporte",
    titulo: "Soporte técnico",
    descripcion:
      "Aparecen en el correo con un enlace para escribirles y van en copia de cada bienvenida.",
  },
  {
    rol: "coordinacion",
    titulo: "Coordinación",
    descripcion: "Aparecen en el correo con un enlace para escribirles. No van en copia.",
  },
];

/**
 * 036 — Quién es Soporte técnico y quién Coordinación en el correo de
 * bienvenida. Se elige de entre el equipo, una vez para toda la academia.
 */
export function WelcomeTeamClient() {
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [elegido, setElegido] = useState<Elegido>({ soporte: [], coordinacion: [] });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/welcome-team")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { equipo: Miembro[]; elegido: Elegido } | null) => {
        if (d) {
          setEquipo(d.equipo);
          setElegido(d.elegido);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function toggle(rol: Rol, userId: string, on: boolean) {
    setElegido((prev) => ({
      ...prev,
      [rol]: on ? [...prev[rol].filter((id) => id !== userId), userId] : prev[rol].filter((id) => id !== userId),
    }));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/welcome-team", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(elegido),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      notify.error(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    const d = (await res.json().catch(() => null)) as { elegido?: Elegido } | null;
    if (d?.elegido) setElegido(d.elegido);
    notify.success("Equipo del correo de bienvenida guardado.");
  }

  if (!loaded) {
    return (
      <div className="max-w-lg space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Correo de bienvenida</CardTitle>
          <CardDescription>
            Elegí quién figura en el equipo del correo que recibe cada alumno al inscribirse. El
            docente sale de la cohorte; acá se eligen soporte técnico y coordinación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {equipo.length === 0 ? (
            <p className="text-sm text-text-3">
              Todavía no hay nadie en el equipo. Sumalo desde Configuración → Equipo.
            </p>
          ) : (
            ROLES.map(({ rol, titulo, descripcion }) => (
              <fieldset key={rol} className="space-y-2">
                <legend className="text-sm font-semibold">{titulo}</legend>
                <p className="text-xs text-text-3">{descripcion}</p>
                <div className="space-y-1.5">
                  {equipo.map((m) => {
                    const id = `${rol}-${m.userId}`;
                    return (
                      <div key={m.userId} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={elegido[rol].includes(m.userId)}
                          onChange={(e) => toggle(rol, m.userId, e.target.checked)}
                        />
                        <Label htmlFor={id} className="text-sm font-normal leading-tight">
                          {m.name}
                          <span className="ml-1.5 text-xs text-text-3">{m.email}</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))
          )}
          <Button onClick={save} disabled={saving || equipo.length === 0}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
