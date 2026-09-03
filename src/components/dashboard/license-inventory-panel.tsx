"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/licenses").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { inventory: InventoryItem[] };
      setItems(data.inventory);
    })();
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Licencias disponibles
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.softwareId} className="flex items-center justify-between gap-3 text-sm">
            <span>{i.softwareName}</span>
            <span
              className={i.available <= 0 ? "text-destructive" : "text-muted-foreground"}
            >
              {i.available} / {i.total} disponibles
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
