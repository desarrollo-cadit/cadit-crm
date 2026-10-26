"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

type InventoryItem = {
  softwareId: string;
  softwareName: string;
  total: number;
  assignedCount: number;
  available: number;
};

/**
 * 005 iteración 2 — widget de inventario de licencias del home (total vs.
 * disponibles por software). A propósito NO detrás del gate financiero: es
 * información operativa (pedido explícito del dueño), visible para
 * cualquier rol autenticado — `GET /api/dashboard/licenses` exige
 * `academico.ver`, no una capacidad financiera.
 */
export function LicenseInventoryPanel() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/licenses").catch(() => null);
      if (!res?.ok) {
        setFallo(true);
        return;
      }
      const data = (await res.json()) as { inventory: InventoryItem[] };
      setItems(data.inventory);
    })();
  }, []);

  if (fallo) return null;
  if (!items) return <Skeleton className="h-36 w-full" />;

  // 2026-10-26 — Tarjeta callada de "Este mes", con la misma forma que
  // Facturación y Morosidad. Agotada = en rojo: es lo único que pide acción.
  return (
    <div className="min-w-0 rounded-md border bg-muted px-4 py-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-text-2">Licencias disponibles</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay programas con licencias.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.softwareId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.softwareName}</span>
              <span
                className={`shrink-0 tabular-nums ${i.available <= 0 ? "text-destructive" : "text-text-2"}`}
                title={`${i.available} disponibles de ${i.total}`}
              >
                {i.available} / {i.total}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/licencias" className="mt-2 inline-block text-xs font-medium text-brand-text hover:underline">
        Ver quién tiene cada una →
      </Link>
    </div>
  );
}
