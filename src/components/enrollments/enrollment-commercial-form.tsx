"use client";

import { useState } from "react";
import type { CompanyDto } from "@/lib/types";
import type { RosterEntryDto } from "@/server/enrollments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MemberOption = { userId: string; name: string };

/**
 * 005 iteración 2 — edita los datos comerciales de una inscripción YA
 * creada (feedback en vivo: solo se podían fijar al inscribir). El contacto
 * no cambia acá — solo monto/cuotas/cédula/factura/recibo/vendedor/empresa,
 * vía `PATCH /api/enrollments/:id` (`requireFullAccess`). Solo se renderiza
 * cuando `isFullAccess(entry)` es true (ver roster-client.tsx).
 */
export function EnrollmentCommercialForm({
  enrollmentId,
  entry,
  companies,
  members,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  entry: RosterEntryDto;
  companies: CompanyDto[];
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(entry.amount?.toString() ?? "");
  const [installments, setInstallments] = useState(entry.installments?.toString() ?? "");
  const [paymentNotes, setPaymentNotes] = useState(entry.paymentNotes ?? "");
  const [nationalId, setNationalId] = useState(entry.nationalId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(entry.invoiceNumber ?? "");
  const [receiptNumber, setReceiptNumber] = useState(entry.receiptNumber ?? "");
  const [sellerId, setSellerId] = useState(entry.sellerId ?? "");
  const [companyId, setCompanyId] = useState(entry.companyId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/enrollments/${enrollmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: amount.trim() ? Number(amount) : null,
        installments: installments.trim() ? Number(installments) : null,
        paymentNotes: paymentNotes.trim() || null,
        nationalId: nationalId.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        receiptNumber: receiptNumber.trim() || null,
        sellerId: sellerId || null,
        companyId: companyId || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar la inscripción");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Editar datos comerciales</h3>
        <p className="mb-4 text-xs text-muted-foreground">{entry.contact.name}</p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-amount">Monto</Label>
              <Input
                id="ec-amount"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-installments">Cuotas</Label>
              <Input
                id="ec-installments"
                type="number"
                min={0}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-national-id">Cédula</Label>
              <Input
                id="ec-national-id"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-invoice">N° de factura</Label>
              <Input
                id="ec-invoice"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-receipt">N° de recibo</Label>
              <Input
                id="ec-receipt"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-seller">Vendedor</Label>
              <select
                id="ec-seller"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-company">Empresa (facturación B2B)</Label>
            <select
              id="ec-company"
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-payment-notes">Observaciones de pago</Label>
            <Textarea
              id="ec-payment-notes"
              rows={2}
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
