"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ThemePreference } from "@/lib/theme";
import { useEvents } from "@/components/use-events";
import { ITEM_AJUSTES, ITEM_GUIA, NAV_GROUPS } from "@/lib/nav";

/**
 * 027 (FR-004) — La declaración del menú se mudó a `src/lib/nav.ts`.
 *
 * Vivía acá adentro, junto a los íconos, y mientras el único lector fuera
 * este componente daba igual. La guía por rol se renderiza en el SERVIDOR y
 * necesita los mismos destinos: dejarla acá habría obligado a copiar la
 * lista, y dos listas de navegación divergen siempre. Lo que se movió es la
 * DECLARACIÓN; el filtrado por capacidad sigue siendo asunto de este
 * componente, que es donde se sabe qué puede la sesión.
 */

export function AppNav({
  branding,
  userName,
  roleLabel,
  capabilities,
  theme,
}: {
  branding: Branding;
  userName: string;
  /** 020 (T014) — Preferencia de tema, resuelta en el servidor. */
  theme: ThemePreference;
  /** Rótulo visible del rol ("Dirección"), no su llave técnica. */
  roleLabel: string;
  /**
   * 012 (T029) — Lo que esta sesión puede, resuelto en el servidor.
   *
   * Llega como lista y no como nombre de rol a propósito: el menú tiene que
   * seguir funcionando cuando la dueña le saque una capacidad a un rol desde
   * `/settings/roles`, sin que haya que tocar este componente.
   */
  capabilities: readonly string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  // Contactos que llegaron por un formulario de captación en las últimas
  // 48hs (src/server/intake-forms.ts, countRecentFormArrivals) — mismo
  // patrón de badge que "Bandeja".
  const [formArrivals, setFormArrivals] = useState(0);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  async function refetchFormArrivals() {
    const res = await fetch("/api/contacts/form-arrivals-count").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { count: number };
    setFormArrivals(data.count);
  }

  useEffect(() => {
    void refetchUnread();
    void refetchFormArrivals();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  const badgeCounts: Record<string, number> = {
    unread,
    formArrivals,
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-subtle px-3 pb-3.5 pt-4">
      <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sm bg-brand text-[15px] font-bold text-on-accent"
          aria-hidden
        >
          {branding.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-[650] leading-tight tracking-tight">
            {branding.name}
          </span>
          <span className="block text-[11px] text-text-3">Gestión Academia</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-3.5">
        {NAV_GROUPS.map((group) => {
          // Un grupo sin ítems permitidos no se dibuja: un encabezado
          // ("Gestión") con nada debajo parece un error de carga.
          const items = group.items.filter(
            (i) => i.capability === null || capabilities.includes(i.capability)
          );
          if (items.length === 0) return null;
          return (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
              {group.label}
            </span>
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badgeCount =
                "badge" in item && item.badge ? badgeCounts[item.badge] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-tint font-semibold text-brand-text"
                      : "text-text-2 hover:bg-accent"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      active ? "text-brand" : "text-text-3"
                    )}
                    strokeWidth={1.7}
                  />
                  <span className="flex-1">{item.label}</span>
                  {!!badgeCount && badgeCount > 0 && (
                    <span
                      className={cn(
                        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold",
                        active ? "bg-brand text-on-accent" : "bg-border-strong text-text-2"
                      )}
                    >
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* 027 (FR-008/FR-012) — La guía, en la zona inferior: es una utilidad,
          no un módulo de trabajo. Y sin gate, a diferencia de Ajustes: quien
          menos permisos tiene es justamente quien más necesita saber qué
          puede hacer y qué no. Un manual que hay que tener permiso para leer
          no es un manual. */}
      <Link
        href={ITEM_GUIA.href}
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith(ITEM_GUIA.href)
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent"
        )}
      >
        <ITEM_GUIA.icon
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith(ITEM_GUIA.href) ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        {ITEM_GUIA.label}
      </Link>

      {/* 012 (T029) — Configuración solo para quien puede configurar o
          gestionar accesos. Ambas pestañas de adentro (Roles, Equipo) tienen
          su propio gate en el servidor; esto evita ofrecer la puerta. */}
      {(capabilities.includes("configuracion.editar") ||
        capabilities.includes("accesos.gestionar")) && (
      <Link
        href={ITEM_AJUSTES.href}
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith(ITEM_AJUSTES.href)
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent"
        )}
      >
        <ITEM_AJUSTES.icon
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith(ITEM_AJUSTES.href) ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        {ITEM_AJUSTES.label}
      </Link>
      )}

      <div className="mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block text-[11px] text-text-3">
            {/* 012 (T029) — El rótulo del rol viene de la base, así que dice
                "Dirección" o "Coordinación" en vez de un genérico "Equipo". */}
            {roleLabel} · En línea
          </span>
        </span>
        {/* 020 (T014) — El tema es una preferencia de la persona, no un
            permiso: no lleva capacidad y lo ve todo el mundo. */}
        <ThemeToggle initial={theme} size="compact" />
        <button
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded p-1 text-text-3 hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}
