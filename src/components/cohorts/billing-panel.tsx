"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Currency = "UYU" | "PYG" | "USD";
type Status = "pagada" | "parcial" | "vencida" | "pendiente";

type Installment = {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  currency: Currency;
  paid: number;
  balance: number;
  status: Status;
  canceledAt: string | null;
};

type Payment = {
  id: string;
  installmentId: string | null;
  amount: number;
  currency: Currency;
  paidAt: string;
  method: string;
  receiptNumber: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

const SYMBOL: Record<Currency, string> = { UYU: "$", PYG: "Gs. ", USD: "US$" };
const money = (n: number, c: Currency) => `${SYMBOL[c]}${n.toLocaleString("es-UY")}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });

const STATUS_CLASS: Record<Status, string> = {
  pagada: "text-primary",
  parcial: "text-foreground",
  vencida: "text-destructive font-medium",
  pendiente: "text-muted-foreground",
};

/**
 * 008 — Cuotas y pagos de una inscripción.
 *
 * El estado de cada cuota lo calcula el servidor y no se guarda (DV-003): una
 * cuota marcada "al día" que en realidad venció es peor que no tener el dato.
 */
export function BillingPanel({ enrollmentId }: { enrollmentId: string }) {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState("3");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [paying, setPaying] = useState<Installment | null>(null);
  /**
   * 008 (T009) — rearmar el plan anula las cuotas vigentes y crea otras. Va
   * detrás de una confirmación porque cambia lo pactado con el alumno.
   */
  const [refinancing, setRefinancing] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/enrollments/${enrollmentId}/installments`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { installments: Installment[]; payments: Payment[] };
      setInstallments(data.installments);
      setPayments(data.payments);
    }
    setLoading(false);
  }, [enrollmentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function readError(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? fallback;
  }

  async function generatePlan(replace = false) {
    if (!firstDueDate) return;
    const res = await fetch(`/api/enrollments/${enrollmentId}/installments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: Number(count), firstDueDate, replace }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo generar el plan"));
    if (res?.ok) setRefinancing(false);
    void refetch();
  }

  async function voidPayment(paymentId: string) {
    const reason = window.prompt("¿Por qué se anula el pago?");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/payments/${paymentId}/void`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo anular el pago"));
    void refetch();
  }

  // 021 — Esqueleto con la forma de las cuotas, no un texto que después salta.
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  const vigentes = installments.filter((i) => !i.canceledAt);
  const deuda = vigentes.reduce((s, i) => s + i.balance, 0);
  const currency = vigentes[0]?.currency ?? "UYU";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium">Cuotas y pagos</p>
          {installments.length > 0 && (
            <>
              <a
                href={`/api/enrollments/${enrollmentId}/statement`}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                Estado de cuenta
              </a>
              <button
                type="button"
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => setRefinancing(true)}
              >
                Refinanciar
              </button>
            </>
          )}
        </div>
        {vigentes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Saldo:{" "}
            <span className={deuda > 0 ? "font-medium text-destructive" : "text-primary"}>
              {money(deuda, currency)}
            </span>
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {installments.length === 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
          <div className="space-y-1">
            <Label htmlFor={`count-${enrollmentId}`} className="text-xs">
              Cuotas
            </Label>
            <Input
              id={`count-${enrollmentId}`}
              type="number"
              min={1}
              max={60}
              className="h-8 w-20"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`due-${enrollmentId}`} className="text-xs">
              Primer vencimiento
            </Label>
            <Input
              id={`due-${enrollmentId}`}
              type="date"
              className="h-8 w-40"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!firstDueDate} onClick={() => void generatePlan()}>
            Generar plan
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-md border text-xs">
          {installments.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-muted-foreground">#{i.number}</span>
              <span className="w-20">{day(i.dueDate)}</span>
              <span className="w-24">{money(i.amount, i.currency)}</span>
              <span className={`w-20 ${STATUS_CLASS[i.status]}`}>{i.status}</span>
              {i.balance > 0 && (
                <span className="text-muted-foreground">
                  falta {money(i.balance, i.currency)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-auto p-0 text-xs underline"
                onClick={() => setPaying(i)}
              >
                Registrar pago
              </Button>
            </li>
          ))}
        </ul>
      )}

      {payments.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={p.voidedAt ? "line-through" : ""}>
                {day(p.paidAt)} · {money(p.amount, p.currency)} · {p.method}
                {p.receiptNumber ? ` · recibo ${p.receiptNumber}` : ""}
              </span>
              {p.voidedAt ? (
                <span className="text-destructive">anulado: {p.voidReason}</span>
              ) : (
                <button
                  type="button"
                  className="underline hover:text-destructive"
                  onClick={() => void voidPayment(p.id)}
                >
                  anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {refinancing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => setRefinancing(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-semibold">Refinanciar el plan</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Las cuotas actuales quedan <strong>anuladas</strong> —no se borran,
              siguen visibles en el estado de cuenta— y se crean unas nuevas por
              el mismo total. Si alguna ya tiene pagos, primero hay que anularlos.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`refi-count-${enrollmentId}`}>Cuotas nuevas</Label>
                <Input
                  id={`refi-count-${enrollmentId}`}
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`refi-due-${enrollmentId}`}>Primer vencimiento</Label>
                <Input
                  id={`refi-due-${enrollmentId}`}
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRefinancing(false)}>
                Cancelar
              </Button>
              <Button disabled={!firstDueDate} onClick={() => void generatePlan(true)}>
                Rearmar plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <PaymentForm
          enrollmentId={enrollmentId}
          installment={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            void refetch();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * 008 (FR-011) — El formulario genera una clave de idempotencia por intento:
 * doble click en "Registrar" no cobra dos veces.
 */
function PaymentForm({
  enrollmentId,
  installment,
  onClose,
  onSaved,
  onError,
}: {
  enrollmentId: string;
  installment: Installment;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [amount, setAmount] = useState(String(installment.balance));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("transferencia");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit() {
    setSaving(true);
    const res = await fetch(`/api/enrollments/${enrollmentId}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        installmentId: installment.id,
        amount: Number(amount),
        paidAt,
        method,
        receiptNumber: receiptNumber.trim() || null,
        idempotencyKey,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      onError(body?.error?.message ?? "No se pudo registrar el pago");
      return;
    }
    onError(null);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Registrar pago</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Cuota #{installment.number} · vence {day(installment.dueDate)} · falta{" "}
          {money(installment.balance, installment.currency)}. Se admite el pago
          parcial.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Monto</Label>
            <Input
              id="pay-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Fecha del pago</Label>
            <Input
              id="pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Medio</Label>
            <Select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-receipt">Recibo</Label>
            <Input
              id="pay-receipt"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving || !amount} onClick={() => void submit()}>
            {saving ? "Registrando…" : "Registrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
