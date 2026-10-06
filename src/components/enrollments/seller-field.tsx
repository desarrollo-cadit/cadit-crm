"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { opcionesDeVendedor, type SellerOption } from "@/lib/vendedores";

/**
 * 2026-10-06 — El vendedor de una venta, en los dos formularios (alta y
 * edición comercial). La regla de qué se ofrece vive en `opcionesDeVendedor`;
 * la obligatoriedad la decide el servidor y acá sólo se anticipa.
 */
export function SellerField({
  id,
  value,
  onChange,
  sellers,
  required,
  permiteVacio,
  loaded,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  sellers: SellerOption[];
  required: boolean;
  /** Venta vieja que nunca tuvo vendedor: se puede seguir guardando sin él. */
  permiteVacio: boolean;
  /** La lista ya llegó: sin esto, "no hay vendedores" aparecería mientras carga. */
  loaded: boolean;
}) {
  const opciones = opcionesDeVendedor(sellers, { actual: value || null, permiteVacio });
  const sinActivos = loaded && !sellers.some((s) => !s.archived);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Vendedor{required && !permiteVacio ? " *" : ""}
      </Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required && !permiteVacio}>
        {!permiteVacio && <option value="">{loaded ? "Quién hizo la venta" : "Cargando vendedores…"}</option>}
        {opciones.map((o) => (
          <option key={o.id || "vacio"} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {permiteVacio && !value && (
        <p className="text-xs text-muted-foreground">
          Esta venta todavía no tiene vendedor. Conviene indicarlo para que figure en el
          reporte de comisiones.
        </p>
      )}
      {sinActivos && (
        <p className="text-xs text-muted-foreground">
          Todavía no hay vendedores cargados. Se agregan en{" "}
          <a href="/settings/vendedores" className="underline">
            Ajustes → Vendedores
          </a>
          .
        </p>
      )}
    </div>
  );
}
