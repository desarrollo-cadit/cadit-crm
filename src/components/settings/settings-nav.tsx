"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_TABS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * 012 (T029) — Cada pestaña declara la capacidad que exige, y la lista vive en
 * `@/lib/nav` porque no es sólo de esta barra: el índice de la sección la usa
 * para decidir a dónde entrar, y un test la usa para exigir que cada pantalla
 * declare su gate. Tenerla acá adentro fue lo que dejó al índice mandando a
 * todo el mundo a WhatsApp.
 */
export function SettingsNav({ capabilities }: { capabilities: readonly string[] }) {
  const pathname = usePathname();
  const tabs = SETTINGS_TABS.filter((t) => capabilities.includes(t.capability));
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
