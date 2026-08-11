"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  FlaskConical,
  GraduationCap,
  Inbox,
  Kanban,
  LogOut,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";

const NAV_GROUPS = [
  {
    label: "Inicio",
    items: [
      { href: "/", label: "Dashboard", icon: Kanban },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/inbox", label: "Bandeja", icon: Inbox, badge: "unread" },
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/contacts", label: "Alumnos", icon: Users, badge: "formArrivals" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/academico", label: "Académico", icon: GraduationCap },
      { href: "/calendar", label: "Calendario", icon: CalendarDays },
    ],
  },
  {
    label: "Inteligencia artificial",
    items: [
      { href: "/agent", label: "Agente", icon: Sparkles },
      { href: "/lab", label: "Laboratorio", icon: FlaskConical },
    ],
  },
] as const;

export function AppNav({
  branding,
  userName,
  role,
}: {
  branding: Branding;
  userName: string;
  role: string;
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
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sm bg-brand text-[15px] font-bold text-white"
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
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
              {group.label}
            </span>
            {group.items.map((item) => {
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
                        active ? "bg-brand text-white" : "bg-border-strong text-text-2"
                      )}
                    >
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      <Link
        href="/settings"
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/settings")
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent"
        )}
      >
        <Settings
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith("/settings") ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        Ajustes
      </Link>

      <div className="mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block text-[11px] text-text-3">
            {role === "owner" ? "Propietario" : "Equipo"} · En línea
          </span>
        </span>
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
