"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, type ViewPreference } from "@/lib/view-preference";

const DESTINO: Record<ViewPreference, string> = { equipo: "/", profesor: "/portal" };
const ETIQUETA: Record<ViewPreference, string> = { equipo: "Equipo", profesor: "Profesor" };

/**
 * 030 (addendum) — "Ver como: Equipo / Profesor".
 *
 * Solo aparece para quien es las dos cosas, y va en las DOS barras (panel y
 * portal) para que siempre haya forma de volver. Es navegación, no permiso:
 * cada lado sigue con su puerta (`member` / `account_link`). La elección se
 * guarda en una cookie para que `/` abra la última vista al volver a entrar.
 */
export function ViewSwitch({ current, tone = "panel" }: { current: ViewPreference; tone?: "panel" | "portal" }) {
  const router = useRouter();

  function elegir(vista: ViewPreference) {
    document.cookie = `${VIEW_COOKIE}=${vista}; path=/; max-age=${VIEW_COOKIE_MAX_AGE}; samesite=lax`;
    if (vista === current) return;
    router.push(DESTINO[vista]);
    router.refresh();
  }

  return (
    <div role="group" aria-label="Ver como" data-view-switch={current} className="px-1">
      <p className="mb-1 px-1.5 text-[11px] text-text-3">Ver como</p>
      <div className="flex rounded-md border border-border p-0.5">
        {(["equipo", "profesor"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === current}
            data-view-option={v}
            onClick={() => elegir(v)}
            className={cn(
              "flex-1 rounded-sm px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone === "portal" ? "h-11 md:h-8" : "h-7",
              v === current ? "bg-accent text-foreground" : "text-text-3 hover:bg-accent hover:text-foreground"
            )}
          >
            {ETIQUETA[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
