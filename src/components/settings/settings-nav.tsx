"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 012 (T029) — Cada pestaña declara la capacidad que exige.
 *
 * `accesos.gestionar` y `configuracion.editar` son cosas distintas: alguien
 * puede dar de alta cuentas sin poder tocar la conexión de WhatsApp. Por eso
 * Equipo pide una y el resto la otra.
 */
const TABS = [
  { href: "/settings/whatsapp", label: "WhatsApp", capability: "configuracion.editar" },
  { href: "/settings/branding", label: "Marca", capability: "configuracion.editar" },
  { href: "/settings/templates", label: "Plantillas", capability: "configuracion.editar" },
  { href: "/settings/forms", label: "Formularios", capability: "configuracion.editar" },
  { href: "/settings/team", label: "Equipo", capability: "accesos.gestionar" },
  // 012 (T020) — Va después de Equipo a propósito: primero se ve QUIÉN está,
  // y después qué puede hacer cada rol.
  { href: "/settings/roles", label: "Roles", capability: "configuracion.editar" },
] as const;

export function SettingsNav({ capabilities }: { capabilities: readonly string[] }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => capabilities.includes(t.capability));
  return (
    <nav className="w-44 shrink-0 space-y-1 border-r p-3">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith(t.href)
              ? "bg-brand-tint text-brand-text"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
