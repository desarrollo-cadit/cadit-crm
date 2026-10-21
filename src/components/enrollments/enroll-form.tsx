"use client";

import { useEffect, useState } from "react";
import type { CohortDto, CompanyDto, ContactDto } from "@/lib/types";
import { formatCalendarDay } from "@/lib/utils";
import { cohortesInscribibles, etiquetaDeCohorte } from "@/lib/cohortes-inscribibles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SellerField } from "@/components/enrollments/seller-field";
import type { SellerOption } from "@/lib/vendedores";
import { notify } from "@/lib/notify";
import { Modal, useDirty } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { ContactPicker } from "@/components/contacts/contact-picker";

/** Lo que el formulario le cuenta a quien lo abrió cuando la inscripción se creó. */
export type EnrollSavedResult = {
  cohortId: string;
  /** Etiqueta legible de la cohorte, si el formulario la conoce (solo cuando la eligió acá). */
  cohortLabel: string | null;
};

/** El inicio de la cohorte: un DÍA (medianoche UTC), no un instante. */
function fechaCorta(iso: string): string {
  return formatCalendarDay(iso, { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * 005 (T021, US2, contracts/enrollments.md) — alta comercial de una
 * inscripción para ventas: monto, cuotas, cédula, factura, recibo, vendedor
 * y empresa opcional, contra un contacto existente o uno nuevo. El dedup de
 * email/celular lo aplica el servidor (409 explicable, DV-002/DV-003).
 *
 * Inscribir desde el contacto — el mismo formulario sirve para arrancar desde
 * una PERSONA (legajo, bandeja, listado de alumnos):
 * - sin `cohortId`, pide la cohorte con un selector (solo las que se pueden
 *   inscribir: ver `cohortesInscribibles`);
 * - con `initialContact`, arranca con ese contacto elegido y bloqueado.
 */
export function EnrollForm({
  cohortId,
  initialContact,
  companies,
  sellers,
  sellersLoaded,
  onClose,
  onSaved,
  onCompanyCreated,
}: {
  /** Sin cohorte fija, el formulario muestra el selector de cohorte. */
  cohortId?: string;
  /** Contacto ya elegido: sin búsqueda ni cambio de modo. */
  initialContact?: { id: string; name: string };
  companies: CompanyDto[];
  /** 2026-10-06 — de `/api/sellers` (activos y archivados; el campo filtra). */
  sellers: SellerOption[];
  sellersLoaded: boolean;
  onClose: () => void;
  onSaved: (result: EnrollSavedResult) => void;
  onCompanyCreated: (company: CompanyDto) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(
    initialContact ? "existing" : "new"
  );
  const [pickedContact, setPickedContact] = useState<ContactDto | null>(null);
  const contactId = initialContact?.id ?? pickedContact?.id ?? null;

  const [cohortOptions, setCohortOptions] = useState<CohortDto[] | null>(null);
  const [cohortLoadFailed, setCohortLoadFailed] = useState(false);
  const [selectedCohortId, setSelectedCohortId] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");

  const [amount, setAmount] = useState<number | null>(null);
  // 007 — moneda del pago: los alumnos de Paraguay pagan en guaraníes.
  const [currency, setCurrency] = useState<"UYU" | "PYG" | "USD">("UYU");
  const [installments, setInstallments] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin cohorte fija: se carga la lista una vez, al abrir.
  useEffect(() => {
    if (cohortId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/cohorts").catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setCohortLoadFailed(true);
        setCohortOptions([]);
        return;
      }
      const data = (await res.json()) as { cohorts: CohortDto[] };
      if (!cancelled) setCohortOptions(cohortesInscribibles(data.cohorts));
    })();
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  // Lo que el usuario cargó; el modo y la lista de grupos no cuentan.
  const dirty = useDirty({
    selectedCohortId,
    pickedContact: pickedContact?.id ?? null,
    firstName,
    lastName,
    phone,
    email,
    nationalId,
    amount,
    currency,
    installments,
    paymentNotes,
    invoiceNumber,
    receiptNumber,
    sellerId,
    companyId,
    newCompanyName,
  });

  async function addCompany() {
    const legalName = newCompanyName.trim();
    if (!legalName) return;
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legalName }),
    }).catch(() => null);
    if (!res?.ok) {
      // 040 — Un RUT repetido o una razón social inválida se dicen, no se tragan.
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo crear la empresa");
      return;
    }
    const data = (await res.json()) as { company: CompanyDto };
    onCompanyCreated(data.company);
    setCompanyId(data.company.id);
    setNewCompanyName("");
  }

  async function submit() {
    setError(null);
    const targetCohortId = cohortId ?? selectedCohortId;
    if (!targetCohortId) {
      setError("Falta elegir el grupo.");
      return;
    }
    if (mode === "existing" && !contactId) {
      setError("Elegí un contacto existente o cambiá a 'Contacto nuevo'");
      return;
    }
    if (mode === "new" && (!firstName.trim() || !phone.trim())) {
      setError("Nombre y celular son obligatorios para un contacto nuevo");
      return;
    }
    // 2026-10-06 — Toda inscripción en una cohorte es una venta: el servidor
    // la rechaza sin vendedor, y acá se anticipa para no perder lo cargado.
    if (!sellerId) {
      setError("Falta indicar el vendedor: toda inscripción en un grupo es una venta.");
      return;
    }

    setSaving(true);
    const payload = {
      cohortId: targetCohortId,
      ...(mode === "existing"
        ? { contactId }
        : {
            contact: {
              firstName: firstName.trim(),
              lastName: lastName.trim() || undefined,
              phone: phone.trim(),
              email: email.trim() || undefined,
              nationalId: nationalId.trim() || undefined,
            },
          }),
      amount,
      currency,
      installments: installments.trim() ? Number(installments) : null,
      paymentNotes: paymentNotes.trim() || null,
      invoiceNumber: invoiceNumber.trim() || null,
      receiptNumber: receiptNumber.trim() || null,
      sellerId: sellerId || null,
      companyId: companyId || null,
    };

    const res = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      // Las validaciones locales quedan inline junto al botón; el rechazo del
      // servidor es el resultado de la acción y va en toast.
      notify.error(body?.error?.message ?? "No se pudo inscribir al alumno");
      return;
    }
    const chosen = cohortOptions?.find((c) => c.id === targetCohortId);
    onSaved({
      cohortId: targetCohortId,
      cohortLabel: chosen ? etiquetaDeCohorte(chosen) : null,
    });
  }

  return (
    <Modal
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      labelledBy="enr-title"
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
        <h3 id="enr-title" className="mb-4 font-semibold">Inscribir alumno</h3>

        {!cohortId && (
          <div className="mb-4 space-y-1.5">
            <Label htmlFor="enr-cohort">Grupo</Label>
            <Select
              id="enr-cohort"
              value={selectedCohortId}
              disabled={cohortOptions === null}
              onChange={(e) => setSelectedCohortId(e.target.value)}
            >
              <option value="">
                {cohortOptions === null ? "Cargando grupos…" : "Elegí un grupo"}
              </option>
              {(cohortOptions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {`${etiquetaDeCohorte(c)} · ${
                    c.status === "en_curso"
                      ? `en curso desde el ${fechaCorta(c.startDate)}`
                      : `empieza el ${fechaCorta(c.startDate)}`
                  }`}
                </option>
              ))}
            </Select>
            {cohortLoadFailed && (
              <p className="text-xs text-destructive">
                No pudimos cargar los grupos. Podés cerrar el formulario y
                volver a abrirlo en un rato.
              </p>
            )}
            {!cohortLoadFailed && cohortOptions?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Por ahora no tenemos grupos abiertos para inscribir.
              </p>
            )}
          </div>
        )}

        {initialContact ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Alumno</p>
            <p className="rounded-md border bg-subtle px-3 py-2 text-sm">
              {initialContact.name}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${mode === "new" ? "bg-primary text-primary-foreground" : "border"}`}
                onClick={() => setMode("new")}
              >
                Contacto nuevo
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${mode === "existing" ? "bg-primary text-primary-foreground" : "border"}`}
                onClick={() => setMode("existing")}
              >
                Contacto existente
              </button>
            </div>

            {mode === "new" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="enr-first-name">Nombre</Label>
                    <Input
                      id="enr-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="enr-last-name">Apellido</Label>
                    <Input
                      id="enr-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="enr-phone">Celular</Label>
                    <Input
                      id="enr-phone"
                      placeholder="5215512345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="enr-email">Email</Label>
                    <Input id="enr-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="enr-national-id">Cédula</Label>
                    <Input
                      id="enr-national-id"
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <ContactPicker
                id="enr-contact-search"
                value={pickedContact}
                onChange={setPickedContact}
              />
            )}
          </>
        )}

        <div className="mt-4 space-y-3 border-t pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enr-amount">Monto</Label>
              <div className="flex items-start gap-2">
                <MoneyInput
                  id="enr-amount"
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                />
                <Select
                  aria-label="Moneda"
                  className="w-auto px-2"
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as "UYU" | "PYG" | "USD")
                  }
                >
                  <option value="UYU">$U</option>
                  <option value="PYG">Gs.</option>
                  <option value="USD">US$</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enr-installments">Cuotas</Label>
              <Input
                id="enr-installments"
                type="number"
                min={0}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enr-invoice">N° de factura</Label>
              <Input
                id="enr-invoice"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enr-receipt">N° de recibo</Label>
              <Input
                id="enr-receipt"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="enr-payment-notes">Observaciones de pago</Label>
            <Textarea
              id="enr-payment-notes"
              rows={2}
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>

          <SellerField
            id="enr-seller"
            value={sellerId}
            onChange={setSellerId}
            sellers={sellers}
            loaded={sellersLoaded}
            required
            permiteVacio={false}
          />

          <div className="space-y-1.5">
            <Label htmlFor="enr-company">Empresa (facturación B2B)</Label>
            <select
              id="enr-company"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">No aplica</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                placeholder="Nueva empresa…"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newCompanyName.trim()}
                onClick={() => void addCompany()}
              >
                Agregar
              </Button>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Inscribiendo…" : "Inscribir"}
          </Button>
        </div>
    </Modal>
  );
}
