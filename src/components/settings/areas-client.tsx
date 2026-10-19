"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CONFIG_AREA_LABELS, type AreaConfigDto, type ConfigArea } from "@/lib/areas";
import {
  AREA_HELP,
  AREA_LIMITS,
  atiendeClientes,
  buildAreaBody,
  formFromDto,
  llevaVendedores,
  type AreaForm,
  type AreaFormErrors,
} from "@/lib/area-config-form";
import { notify } from "@/lib/notify";
import { WEEKDAY_LABELS } from "@/lib/utils";

type Seller = { id: string; name: string; email: string | null };

type AreasData = {
  routingEnabled: boolean;
  m365Configured: boolean;
  areas: AreaConfigDto<ConfigArea>[];
  sellers: Seller[];
  timezone: string;
};

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  );
}

/**
 * Configuración › Áreas (029 US4 + 039): la casilla y las copias de cada área.
 *
 * Todo sale de `GET /api/settings/areas` (incluidos los vendedores activos,
 * bajo la misma capacidad) y cada tarjeta guarda la suya con
 * `PUT /api/settings/areas/[area]`. El interruptor de arriba es el ruteo del
 * agente (`PATCH /api/settings/areas`).
 */
export function AreasClient() {
  const [data, setData] = useState<AreasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/areas").catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setData((await res.json()) as AreasData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRouting(on: boolean) {
    setRoutingSaving(true);
    const res = await fetch("/api/settings/areas", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routingEnabled: on }),
    }).catch(() => null);
    setRoutingSaving(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No pudimos cambiar la derivación. Podés intentarlo otra vez en un momento."));
      return;
    }
    setData((prev) => (prev ? { ...prev, routingEnabled: on } : prev));
    notify.success(on ? "Derivación por áreas encendida." : "Derivación por áreas apagada.");
  }

  if (loading && !data) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="max-w-3xl space-y-3 rounded-lg border bg-card p-6">
        <p className="text-sm">No pudimos cargar la configuración de las áreas.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Áreas</h3>
        <p className="text-sm text-text-3">
          A qué casilla y con qué copias llegan las derivaciones del asistente de WhatsApp y los
          avisos internos de cada área.
        </p>
      </div>

      {!data.m365Configured && (
        <p className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
          El correo de Microsoft 365 no está configurado: las derivaciones y los avisos quedan
          registrados, pero no se envían.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Derivación del asistente</CardTitle>
          <CardDescription>
            Con la derivación encendida, el asistente de WhatsApp manda a Ventas o a Soporte las
            consultas que no resuelve él. No afecta los avisos internos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CheckboxField
            className="text-sm"
            label="Derivar consultas a las áreas"
            checked={data.routingEnabled}
            disabled={routingSaving}
            onChange={(e) => void setRouting(e.target.checked)}
          />
        </CardContent>
      </Card>

      {data.areas.map((dto) => (
        <AreaCard
          key={dto.area}
          dto={dto}
          sellers={data.sellers}
          timezone={data.timezone}
          onSaved={(saved) =>
            setData((prev) =>
              prev ? { ...prev, areas: prev.areas.map((a) => (a.area === saved.area ? saved : a)) } : prev
            )
          }
        />
      ))}
    </div>
  );
}

function AreaCard({
  dto,
  sellers,
  timezone,
  onSaved,
}: {
  dto: AreaConfigDto<ConfigArea>;
  sellers: Seller[];
  timezone: string;
  onSaved: (saved: AreaConfigDto<ConfigArea>) => void;
}) {
  const area = dto.area;
  const [form, setForm] = useState<AreaForm>(() => formFromDto(dto));
  const [errors, setErrors] = useState<AreaFormErrors>({});
  const [saving, setSaving] = useState(false);

  const clientes = atiendeClientes(area);
  const conVendedores = llevaVendedores(area);
  const activos = sellers.map((s) => s.id);
  const ausentes = form.ccSellerIds.filter((id) => !activos.includes(id));
  const idBase = `area-${area}`;

  function patch(partial: Partial<AreaForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function toggleSeller(id: string, on: boolean) {
    setForm((prev) => ({
      ...prev,
      ccSellerIds: on
        ? [...prev.ccSellerIds.filter((x) => x !== id), id]
        : prev.ccSellerIds.filter((x) => x !== id),
    }));
  }

  function toggleDay(day: number, on: boolean) {
    setForm((prev) => ({
      ...prev,
      days: on ? [...prev.days.filter((d) => d !== day), day] : prev.days.filter((d) => d !== day),
    }));
  }

  async function save() {
    const built = buildAreaBody(area, form, activos);
    if (!built.ok) {
      setErrors(built.errors);
      notify.error("Revisá los campos marcados antes de guardar.");
      return;
    }
    setErrors({});
    setSaving(true);
    const res = await fetch(`/api/settings/areas/${area}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(built.body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No pudimos guardar el área. Podés intentarlo otra vez en un momento."));
      return;
    }
    const saved = ((await res.json()) as { area: AreaConfigDto<ConfigArea> }).area;
    setForm(formFromDto(saved));
    onSaved(saved);
    notify.success(`${CONFIG_AREA_LABELS[area]} guardada.`);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{CONFIG_AREA_LABELS[area]}</CardTitle>
          {dto.enabled ? (
            <Badge variant="success">Encendida</Badge>
          ) : (
            <Badge variant="secondary">Apagada</Badge>
          )}
          {!clientes && <Badge variant="outline">Solo interna</Badge>}
        </div>
        <CardDescription>{AREA_HELP[area]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <CheckboxField
          className="text-sm"
          label="Área encendida (sin casilla no se le manda nada)"
          checked={form.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-mailbox`}>Casilla</Label>
            <Input
              id={`${idBase}-mailbox`}
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="area@academia.com"
              value={form.mailbox}
              aria-invalid={errors.mailbox ? true : undefined}
              aria-describedby={errors.mailbox ? `${idBase}-mailbox-error` : undefined}
              onChange={(e) => patch({ mailbox: e.target.value })}
            />
            <FieldError id={`${idBase}-mailbox-error`} message={errors.mailbox} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-cc`}>Correos en copia</Label>
            <Input
              id={`${idBase}-cc`}
              autoComplete="off"
              placeholder="una@academia.com, otra@academia.com"
              value={form.ccEmails}
              aria-invalid={errors.ccEmails ? true : undefined}
              aria-describedby={`${idBase}-cc-hint${errors.ccEmails ? ` ${idBase}-cc-error` : ""}`}
              onChange={(e) => patch({ ccEmails: e.target.value })}
            />
            <p id={`${idBase}-cc-hint`} className="text-xs text-text-3">
              Separados por coma. Hasta {AREA_LIMITS.ccEmails}.
            </p>
            <FieldError id={`${idBase}-cc-error`} message={errors.ccEmails} />
          </div>
        </div>

        {conVendedores && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Vendedores en copia</legend>
            {sellers.length === 0 && ausentes.length === 0 ? (
              <p className="text-xs text-text-3">
                No hay vendedores activos. Se cargan en Configuración → Vendedores.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {sellers.map((s) => {
                  const id = `${idBase}-seller-${s.id}`;
                  const elegido = form.ccSellerIds.includes(s.id);
                  return (
                    <div key={s.id} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={elegido}
                        // Sin correo no hay a quién copiar; si ya estaba elegido, se puede quitar.
                        disabled={!s.email && !elegido}
                        onChange={(e) => toggleSeller(s.id, e.target.checked)}
                      />
                      <Label htmlFor={id} className="min-w-0 text-sm font-normal leading-tight">
                        {s.name}
                        <span className="ml-1.5 break-all text-xs text-text-3">
                          {s.email ?? "sin correo"}
                        </span>
                      </Label>
                    </div>
                  );
                })}
                {ausentes.map((sid) => {
                  const id = `${idBase}-seller-${sid}`;
                  return (
                    <div key={sid} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked
                        onChange={() => toggleSeller(sid, false)}
                      />
                      <Label htmlFor={id} className="text-sm font-normal leading-tight text-text-3">
                        Vendedor que ya no está activo
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
            <FieldError id={`${idBase}-sellers-error`} message={errors.ccSellerIds} />
          </fieldset>
        )}

        {clientes && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idBase}-contact`}>Qué se le dice al cliente</Label>
              <Textarea
                id={`${idBase}-contact`}
                rows={3}
                maxLength={AREA_LIMITS.contactText}
                placeholder="Te va a contactar el equipo por correo…"
                value={form.contactText}
                aria-invalid={errors.contactText ? true : undefined}
                onChange={(e) => patch({ contactText: e.target.value })}
              />
              <p className="text-xs text-text-3">
                Lo que contesta el asistente al derivar. Vacío usa el texto por defecto.{" "}
                {form.contactText.length}/{AREA_LIMITS.contactText}
              </p>
              <FieldError id={`${idBase}-contact-error`} message={errors.contactText} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Horario de atención</legend>
              <CheckboxField
                className="text-sm"
                label={`Avisarle al cliente fuera de horario (zona ${timezone})`}
                checked={form.hoursEnabled}
                onChange={(e) => patch({ hoursEnabled: e.target.checked })}
              />
              {form.hoursEnabled && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <CheckboxField
                        key={label}
                        className="text-sm"
                        label={label}
                        checked={form.days.includes(day)}
                        onChange={(e) => toggleDay(day, e.target.checked)}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idBase}-from`}>Desde</Label>
                      <Input
                        id={`${idBase}-from`}
                        type="time"
                        className="w-32"
                        value={form.from}
                        onChange={(e) => patch({ from: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idBase}-to`}>Hasta</Label>
                      <Input
                        id={`${idBase}-to`}
                        type="time"
                        className="w-32"
                        value={form.to}
                        onChange={(e) => patch({ to: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <FieldError id={`${idBase}-hours-error`} message={errors.officeHours} />
            </fieldset>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : `Guardar ${CONFIG_AREA_LABELS[area]}`}
          </Button>
          {dto.updatedAt && (
            <span className="text-xs text-text-3">
              Último cambio: {new Date(dto.updatedAt).toLocaleString("es-UY")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
