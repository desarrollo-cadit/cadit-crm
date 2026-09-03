"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatAmount } from "@/lib/utils";
import {
  EmptyNote,
  PortalCard,
  SectionTitle,
  formatDate,
} from "@/components/portal/student-bits";

/**
 * 015 (US7, FR-006) — Mi estado de cuenta.
 *
 * DV-002 — La deuda vencida se muestra. Ocultarla no la hace desaparecer:
 * genera exactamente la llamada que este portal vino a evitar.
 *
 * **Nunca se suman monedas distintas** (corrección del ciclo 007). Un alumno
 * con una cursada en pesos y otra en guaraníes ve dos saldos, cada uno con su
 * símbolo. Un total único sería un número que no existe.
 */

type InstallmentStatus = "pagada" | "parcial" | "vencida" | "pendiente";

type Account = {
  balances: {
    currency: string;
    total: number;
    paid: number;
    balance: number;
    overdueCount: number;
    nextDueDate: string | null;
  }[];
  entries: {
    enrollmentId: string;
    cohortName: string;
    courseName: string;
    currency: string;
    billedToCompany: boolean;
    companyName: string | null;
    installments: {
      number: number;
      dueDate: string;
      amount: number;
      currency: string;
      paid: number;
      balance: number;
      status: InstallmentStatus;
    }[];
    payments: {
      amount: number;
      currency: string;
      paidAt: string;
      method: string;
      receiptNumber: string | null;
    }[];
  }[];
};

const ESTADO: Record<InstallmentStatus, { label: string; className: string }> = {
  pagada: { label: "Pagada", className: "border-success-border bg-success-soft text-success" },
  parcial: { label: "Pago parcial", className: "border-warning-border bg-warning-soft text-warning" },
  vencida: { label: "Vencida", className: "border-danger-border bg-danger-soft text-danger" },
  pendiente: { label: "Pendiente", className: "border-border bg-secondary text-text-2" },
};

export function StudentAccountClient() {
  const [data, setData] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/me/cuenta").catch(() => null);
      if (!res?.ok) {
        setError("No pudimos cargar tu estado de cuenta. Probá de nuevo en un momento.");
        return;
      }
      setData((await res.json()) as Account);
    })();
  }, []);

  if (error) {
    return (
      <PortalCard className="border-danger-border bg-danger-soft">
        <p className="text-sm text-danger">{error}</p>
      </PortalCard>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <EmptyNote title="Todavía no hay movimientos en tu cuenta">
        Cuando la academia genere tu plan de cuotas vas a ver acá qué pagaste,
        qué falta y cuándo vence cada cuota.
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-8">
      {/* Una sola moneda ocupa el ancho; la grilla aparece cuando hay dos. */}
      <section className={cn("grid gap-3", data.balances.length > 1 && "sm:grid-cols-2")}>
        {data.balances.map((b) => (
          <PortalCard key={b.currency}>
            <p className="text-sm text-text-3">
              Saldo{data.balances.length > 1 && ` en ${b.currency}`}
            </p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                b.overdueCount > 0 && "text-danger"
              )}
            >
              {formatAmount(b.balance, b.currency)}
            </p>
            <p className="mt-1 text-xs text-text-3">
              Pagaste {formatAmount(b.paid, b.currency)} de{" "}
              {formatAmount(b.total, b.currency)}
            </p>
            {b.overdueCount > 0 ? (
              <p className="mt-2 text-xs font-medium text-danger">
                {b.overdueCount} {b.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"}
              </p>
            ) : b.nextDueDate ? (
              <p className="mt-2 text-xs text-text-3">
                Próximo vencimiento: {formatDate(b.nextDueDate)}
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-success">Al día</p>
            )}
          </PortalCard>
        ))}
      </section>

      {data.entries.map((e) => (
        <section key={e.enrollmentId} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{e.courseName}</h2>
            <p className="text-sm text-text-3">{e.cohortName}</p>
          </div>

          {/*
            DV-005 — Si la inscripción la factura una empresa, el alumno ve de
            quién es la cuenta. Sin esa línea, un saldo abierto se lee como
            deuda propia y genera la consulta que este portal vino a evitar.
          */}
          {e.billedToCompany && (
            <p className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-text-2">
              <Building2 className="h-3.5 w-3.5" strokeWidth={1.7} />
              Esta inscripción la factura {e.companyName ?? "tu empresa"}.
            </p>
          )}

          {e.installments.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-subtle text-left text-xs uppercase tracking-wide text-text-3">
                    <th className="px-4 py-2.5 font-semibold">Cuota</th>
                    <th className="px-4 py-2.5 font-semibold">Vence</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Importe</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Pagado</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {e.installments.map((i) => (
                    <tr key={i.number}>
                      <td className="px-4 py-3 tabular-nums">{i.number}</td>
                      <td className="px-4 py-3 text-text-2">{formatDate(i.dueDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatAmount(i.amount, i.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-2">
                        {formatAmount(i.paid, i.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatAmount(i.balance, i.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            ESTADO[i.status].className
                          )}
                        >
                          {ESTADO[i.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {e.payments.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Pagos registrados</SectionTitle>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {e.payments.map((p, idx) => (
                  <li
                    key={`${p.paidAt}-${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">
                        {formatAmount(p.amount, p.currency)}
                      </span>
                      <span className="block text-xs text-text-3">
                        {formatDate(p.paidAt)} · {p.method}
                        {p.receiptNumber && ` · recibo ${p.receiptNumber}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
