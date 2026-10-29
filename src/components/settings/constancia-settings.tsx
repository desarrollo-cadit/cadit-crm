"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type Config = { firmaNombre: string | null; firmaCargo: string | null; ciudad: string; pie: string[] };

/**
 * 2026-10-29 — Quién firma las constancias para empresas (una vez por
 * academia), la ciudad del encabezado y el pie de cada página. Vive junto a
 * la marca porque es configuración de la academia (`configuracion.editar`).
 */
export function ConstanciaSettings() {
  const [firmaNombre, setFirmaNombre] = useState("");
  const [firmaCargo, setFirmaCargo] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [pie, setPie] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  function cargar(c: Config) {
    setFirmaNombre(c.firmaNombre ?? "");
    setFirmaCargo(c.firmaCargo ?? "");
    setCiudad(c.ciudad);
    setPie(c.pie.join("\n"));
  }

  useEffect(() => {
    fetch("/api/settings/constancias")
      .then((r) => (r.ok ? (r.json() as Promise<{ config: Config }>) : null))
      .then((d) => {
        if (d) cargar(d.config);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/constancias", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firmaNombre, firmaCargo, ciudad, pie }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    cargar(((await res.json()) as { config: Config }).config);
    notify.success("Constancias guardadas.");
  }

  if (!loaded) return <Skeleton className="h-48 w-full max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Constancias para empresas</CardTitle>
        <CardDescription>
          Quién firma la carta que se le manda a una empresa sobre sus empleados, y lo que va en el
          encabezado y el pie. Sin firma, la constancia sale con la línea en blanco.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="constancia-firma">Firma</Label>
            <Input
              id="constancia-firma"
              maxLength={80}
              value={firmaNombre}
              onChange={(e) => setFirmaNombre(e.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="constancia-cargo">Cargo</Label>
            <Input
              id="constancia-cargo"
              maxLength={80}
              value={firmaCargo}
              onChange={(e) => setFirmaCargo(e.target.value)}
              placeholder="Coordinación de cursos"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="constancia-ciudad">Ciudad del encabezado</Label>
          <Input
            id="constancia-ciudad"
            maxLength={60}
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Montevideo"
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="constancia-pie">Pie de página</Label>
          <Textarea
            id="constancia-pie"
            rows={4}
            maxLength={400}
            value={pie}
            onChange={(e) => setPie(e.target.value)}
            placeholder={"Dirección: …\nTeléfono: …\nSitio web y correo"}
          />
          <p className="text-xs text-text-3">Hasta 4 líneas; se repite en cada página.</p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
}
