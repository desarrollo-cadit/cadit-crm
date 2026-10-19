"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_TERMS, PAYMENT_TERMS_LABEL, type PaymentTerms } from "@/lib/company";
import type { CompanyDto } from "@/lib/types";
import { notify } from "@/lib/notify";

type Borrador = {
  legalName: string;
  tradeName: string;
  taxId: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressCountry: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  paymentTerms: PaymentTerms | "";
  paymentTermDays: string;
  notes: string;
};

function borradorDe(c: CompanyDto | null): Borrador {
  return {
    legalName: c?.legalName ?? "",
    tradeName: c?.tradeName ?? "",
    taxId: c?.taxId ?? "",
    addressStreet: c?.addressStreet ?? "",
    addressCity: c?.addressCity ?? "",
    addressState: c?.addressState ?? "",
    // Una empresa nueva casi siempre es uruguaya: se propone, no se impone.
    addressCountry: c ? (c.addressCountry ?? "") : "Uruguay",
    billingContactName: c?.billingContactName ?? "",
    billingEmail: c?.billingEmail ?? "",
    billingPhone: c?.billingPhone ?? "",
    paymentTerms: c?.paymentTerms ?? "",
    paymentTermDays: c?.paymentTermDays ? String(c.paymentTermDays) : "",
    notes: c?.notes ?? "",
  };
}

/**
 * 040 (FR-006) — Alta y edición de una empresa con sus datos de facturación.
 *
 * Una tarjeta en la página y no un modal: son trece campos, y se cargan
 * mirando el correo o la constancia de la empresa en otra ventana. El
 * servidor valida el RUT según el país y avisa si ya hay una empresa con ese
 * RUT; acá solo se muestra lo que responde.
 */
export function CompanyForm({
  company,
  onSaved,
  onCancel,
}: {
  /** `null` = alta. */
  company: CompanyDto | null;
  onSaved: (c: CompanyDto) => void;
  onCancel: () => void;
}) {
  const [b, setB] = useState<Borrador>(() => borradorDe(company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idp = company ? `empresa-${company.id}` : "empresa-nueva";

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setSaving(true);
    setError(null);
    const dias = b.paymentTermDays.trim() === "" ? null : Number(b.paymentTermDays);
    const res = await fetch(company ? `/api/companies/${company.id}` : "/api/companies", {
      method: company ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legalName: b.legalName,
        tradeName: b.tradeName,
        taxId: b.taxId,
        addressStreet: b.addressStreet,
        addressCity: b.addressCity,
        addressState: b.addressState,
        addressCountry: b.addressCountry,
        billingContactName: b.billingContactName,
        billingEmail: b.billingEmail,
        billingPhone: b.billingPhone,
        paymentTerms: b.paymentTerms === "" ? null : b.paymentTerms,
        paymentTermDays: b.paymentTerms === "credito" && dias !== null && Number.isFinite(dias) ? dias : null,
        notes: b.notes,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string; fields?: { message: string }[] } }
        | null;
      setError(
        body?.error?.fields?.[0]?.message ??
          body?.error?.message ??
          "No pudimos guardar la empresa. Podés intentarlo otra vez en un momento."
      );
      return;
    }
    const data = (await res.json()) as { company: CompanyDto };
    notify.success(company ? "Empresa actualizada." : "Empresa creada.");
    onSaved(data.company);
  }

  const campo = (
    k: Exclude<keyof Borrador, "paymentTerms" | "notes">,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idp}-${k}`}>{label}</Label>
      <Input id={`${idp}-${k}`} value={b[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{company ? `Editar ${company.legalName}` : "Nueva empresa"}</CardTitle>
        <CardDescription>
          Solo la razón social es obligatoria. El resto es lo que Administración necesita
          para facturar: completalo cuando lo tengas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset className="grid gap-4 md:grid-cols-3">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            La empresa
          </legend>
          {campo("legalName", "Razón social", { required: true })}
          {campo("tradeName", "Nombre comercial")}
          {campo("taxId", "RUT", { inputMode: "numeric", placeholder: "12 dígitos" })}
        </fieldset>

        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dirección fiscal
          </legend>
          {campo("addressStreet", "Calle y número")}
          {campo("addressCity", "Ciudad")}
          {campo("addressState", "Departamento")}
          {campo("addressCountry", "País")}
        </fieldset>

        <fieldset className="grid gap-4 md:grid-cols-3">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Facturación
          </legend>
          {campo("billingContactName", "A quién se le factura")}
          {campo("billingEmail", "Correo de facturación", { type: "email" })}
          {campo("billingPhone", "Teléfono", { type: "tel" })}
          <div className="space-y-1.5">
            <Label htmlFor={`${idp}-paymentTerms`}>Condición de pago</Label>
            <Select
              id={`${idp}-paymentTerms`}
              value={b.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value as Borrador["paymentTerms"])}
            >
              <option value="">Sin definir</option>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TERMS_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          {b.paymentTerms === "credito" &&
            campo("paymentTermDays", "Plazo en días", { type: "number", min: 1, max: 365 })}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor={`${idp}-notes`}>Notas</Label>
          <Textarea
            id={`${idp}-notes`}
            value={b.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Orden de compra, horario de recepción de facturas…"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button disabled={saving || !b.legalName.trim()} onClick={() => void guardar()}>
            {saving ? "Guardando…" : company ? "Guardar cambios" : "Crear empresa"}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
