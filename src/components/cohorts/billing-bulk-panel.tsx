"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Preview = {
  total: number;
  aplicables: number;
  sinMonto: number;
  yaTienenPlan: number;
};

type Resultado = {
  aplicadas: number;
  saltadas: { enrollmentId: string; motivo: string; detalle: string }[];
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 022 — Cargar la cobranza de una cohorte entera de una vez.
 *
 * El caso que resuelve, medido: **192 inscripciones con monto y ninguna con
 * plan de cuotas**. De a una son 192 recorridos de cuatro pasos, y por eso la
 * cobranza llevaba meses en cero.
 *
 * **La pantalla pregunta QUÉ son estas inscripciones, y no lo adivina.** Es la
 * decisión que el sistema no puede tomar: 152 de ellas ya tienen número de
 * factura, o sea que esa plata ya entró. Generarles un plan a futuro sería
 * mandarle avisos de morosidad a quien ya pagó.
 */
export function BillingBulkPanel({
  cohortId,
  onDone,
}: {
  cohortId: string;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"cobrada" | "plan">("cobrada");
  const [fecha, setFecha] = useState(hoyISO());
  const [metodo, setMetodo] = useState("transferencia");
  const [cuotas, setCuotas] = useState(3);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/billing/bulk`).catch(() => null);
    if (res?.ok) setPreview((await res.json()) as Preview);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Sin inscripciones aplicables no hay nada que ofrecer, y un panel que
  // siempre está pero nunca sirve es ruido en una pantalla que ya tiene mucho.
  if (!preview || preview.aplicables === 0) return null;

  async function aplicar() {
    setTrabajando(true);
    setError(null);
    const cuerpo =
      modo === "cobrada"
        ? { kind: "cobrada", paidAt: fecha, method: metodo }
        : { kind: "plan", count: cuotas, firstDueDate: fecha };

    const res = await fetch(`/api/cohorts/${cohortId}/billing/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    setTrabajando(false);

    if (!res?.ok) {
      const b = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(b?.error?.message ?? "No se pudo aplicar.");
      return;
    }
    setResultado((await res.json()) as Resultado);
    void refetch();
    onDone();
  }

  return (
    <div className="mb-4 rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Cargar la cobranza de esta cohorte
        </span>
        {/* El número ANTES de apretar: qué se va a tocar y qué no. */}
        <span className="text-xs text-muted-foreground">
          {preview.aplicables} de {preview.total} sin cargar
          {preview.sinMonto > 0 && ` · ${preview.sinMonto} sin monto`}
          {preview.yaTienenPlan > 0 && ` · ${preview.yaTienenPlan} ya cargadas`}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium">Qué son</span>
              <Select
                className="w-64"
                value={modo}
                onChange={(e) => setModo(e.target.value as "cobrada" | "plan")}
              >
                <option value="cobrada">Ya se cobraron (un pago)</option>
                <option value="plan">Se cobran en cuotas</option>
              </Select>
            </label>

            {modo === "plan" && (
              <label className="space-y-1.5">
                <span className="block text-xs font-medium">Cuotas</span>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  className="w-24"
                  value={cuotas}
                  onChange={(e) => setCuotas(Number(e.target.value))}
                />
              </label>
            )}

            <label className="space-y-1.5">
              <span className="block text-xs font-medium">
                {modo === "cobrada" ? "Fecha del cobro" : "Primer vencimiento"}
              </span>
              <Input
                type="date"
                className="w-44"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>

            {modo === "cobrada" && (
              <label className="space-y-1.5">
                <span className="block text-xs font-medium">Cómo pagaron</span>
                <Select
                  className="w-40"
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="otro">Otro</option>
                </Select>
              </label>
            )}

            <Button loading={trabajando} onClick={() => void aplicar()}>
              Aplicar a {preview.aplicables}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {modo === "cobrada"
              ? "Deja una cuota por el total, saldada. Es lo que corresponde cuando el dinero ya entró y solo falta registrarlo."
              : "Reparte el monto de cada inscripción en las cuotas indicadas, mes a mes desde el primer vencimiento."}{" "}
            Las que ya tienen cuotas se dejan como están, así que aplicarlo dos
            veces no duplica nada.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {resultado && (
            <div className="rounded-md border bg-subtle p-3 text-xs">
              <p className="font-medium">
                {resultado.aplicadas} inscripción
                {resultado.aplicadas === 1 ? "" : "es"} cargada
                {resultado.aplicadas === 1 ? "" : "s"}.
              </p>
              {resultado.saltadas.length > 0 && (
                <>
                  <p className="mt-1.5 text-muted-foreground">
                    {resultado.saltadas.length} sin tocar:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {/* Agrupadas por motivo: 18 líneas iguales no informan
                        más que una línea con el número. */}
                    {Object.entries(
                      resultado.saltadas.reduce<Record<string, number>>((acc, s) => {
                        acc[s.detalle] = (acc[s.detalle] ?? 0) + 1;
                        return acc;
                      }, {})
                    ).map(([detalle, n]) => (
                      <li key={detalle}>
                        <strong>{n}</strong> — {detalle}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
