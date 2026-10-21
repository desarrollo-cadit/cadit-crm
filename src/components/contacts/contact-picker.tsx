"use client";

import { useEffect, useId, useState } from "react";
import type { ContactDto } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Buscar y elegir un contacto existente. Elegir CIERRA la lista y muestra a
 * la persona elegida (nombre + celular/correo) con "Cambiar": antes la lista
 * quedaba abierta y parecía que el click no había hecho nada.
 *
 * Teclado: flechas para moverse, Enter elige, Escape cierra la lista (sin
 * cerrar el diálogo que la contiene: marca el evento como atendido).
 */
export function ContactPicker({
  id,
  label = "Buscar contacto",
  value,
  onChange,
}: {
  id: string;
  label?: string;
  value: ContactDto | null;
  onChange: (contact: ContactDto | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (value || !query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/contacts?q=${encodeURIComponent(query.trim())}`
      ).catch(() => null);
      if (cancelled || !res?.ok) return;
      const data = (await res.json()) as { contacts: ContactDto[] };
      if (cancelled) return;
      setResults(data.contacts);
      setActive(0);
      setOpen(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, query]);

  function choose(contact: ContactDto) {
    onChange(contact);
    setOpen(false);
    setResults([]);
  }

  if (value) {
    const detail = [value.phone, value.email].filter(Boolean).join(" · ");
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Contacto elegido</p>
        <div
          className="flex items-center justify-between gap-3 rounded-md border bg-subtle px-3 py-2"
          data-testid="contacto-elegido"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{fullName(value)}</p>
            {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
          </div>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => {
              onChange(null);
              setOpen(query.trim().length > 0);
            }}
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  const showList = open && results.length > 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Nombre, teléfono o correo…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && results.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp" && results.length > 0) {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            const picked = results[active];
            if (picked) choose(picked);
          } else if (e.key === "Escape" && showList) {
            // Cierra la lista, no el diálogo.
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="max-h-40 overflow-y-auto rounded-md border">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 text-sm hover:bg-accent ${i === active ? "bg-accent" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
            >
              {fullName(c)}
              {(c.phone || c.email) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.phone ?? c.email}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
