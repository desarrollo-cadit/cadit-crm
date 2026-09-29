"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount } from "@/lib/utils";
import { ChipDeEstado, GrillaDeMetricas, TituloDeSeccion } from "@/components/portal/campus";
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

const ESTADO: Record<
  InstallmentStatus,
  { label: string; tone: "ok" | "curso" | "atencion" | "neutro" }
> = {
  pagada: { label: "Pagada", tone: "curso" },
  parcial: { label: "Pago parcial", tone: "neutro" },
  vencida: { label: "Vencida", tone: "atencion" },
  pendiente: { label: "Pendiente", tone: "neutro" },
};

export function StudentAccountClient() {
  const [data, setData] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/me/cuenta").catch(() => null);
      if (!res?.ok) {
        setError("No se pudo cargar tu estado de cuenta. Intentá nuevamente más tarde.");
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
      <EmptyNote title="Aún no hay movimientos registrados">
        Cuando la academia registre tu plan de cuotas, aquí verás los pagos
        realizados, el saldo pendiente y los vencimientos.
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-8">
      {/*
        Una tarjeta de saldo por moneda: con dos monedas hay dos, nunca un
        total que no existe.
      */}
      <section className="space-y-3">
        {data.balances.map((b) => (
          <GrillaDeMetricas
            key={b.currency}
            items={[
              {
                label: data.balances.length > 1 ? `Saldo en ${b.currency}` : "Saldo",
                value: formatAmount(b.balance, b.currency),
                note: b.balance === 0 ? "al día" : "por pagar",
                alert: b.overdueCount > 0,
              },
              {
                label: "Pagado",
                value: formatAmount(b.paid, b.currency),
                note: `de ${formatAmount(b.total, b.currency)}`,
              },
              b.overdueCount > 0
                ? {
                    label: "Vencidas",
                    value: String(b.overdueCount),
                    note: b.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas",
                    alert: true,
                  }
                : {
                    label: "Próximo vencimiento",
                    value: b.nextDueDate ? formatDate(b.nextDueDate) : "—",
                    note: b.nextDueDate ? undefined : "sin cuotas pendientes",
                  },
            ]}
          />
        ))}
      </section>

      {data.entries.map((e) => (
        <section key={e.enrollmentId} className="space-y-3">
          <div className="space-y-1">
            <TituloDeSeccion>{e.courseName}</TituloDeSeccion>
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
              La facturación de esta inscripción está a cargo de {e.companyName ?? "tu empresa"}.
            </p>
          )}

          {e.installments.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-subtle text-left text-xs font-semibold text-text-3">
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
                        <ChipDeEstado tono={ESTADO[i.status].tone}>
                          {ESTADO[i.status].label}
                        </ChipDeEstado>
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
