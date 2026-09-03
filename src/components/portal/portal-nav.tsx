"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award,
  CalendarClock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ThemePreference } from "@/lib/theme";

/**
 * 021 — La barra lateral del portal.
 *
 * Reemplaza el encabezado angosto que traía 014. La decisión de entonces era
 * razonable —el profesor abre el portal de pie, en el medio de la clase— pero
 * resolvió el celular ROMPIENDO el escritorio: en un monitor quedaba una
 * columna de 768px centrada en el vacío, con una navegación distinta a la del
 * panel que la misma gente usa todos los días. Dos caparazones para un mismo
 * producto se separan, y separarse fue exactamente lo que pasó.
 *
 * Lo que hace este componente es lo que había que hacer desde el principio:
 * **la misma barra lateral del panel, con la intensidad del portal**. Y el
 * celular no se pierde — abajo de `md` la barra se convierte en un cajón que
 * se abre desde el encabezado, con blancos de 44px. El profesor de pie sigue
 * teniendo su pantalla; el alumno en un monitor deja de tener media.
 *
 * NO reusa `AppNav` (014, FR-008): esa barra se arma con capacidades del
 * staff, y ni el alumno ni el profesor tienen ninguna. Reusarla obligaría a
 * llenarla de `if`, que es exactamente cómo un enlace de coordinación termina
 * visible en la pantalla equivocada. Lo que se comparte es la FORMA, no el
 * contenido.
 */

export type PortalNavCourse = {
  enrollmentId: string;
  label: string;
  active: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Coincidencia exacta: `/portal` no se enciende con `/portal/cuenta`. */
  exact?: boolean;
};

export type PortalAudience = {
  isStudent: boolean;
  isTeacher: boolean;
};

const ITEMS_ALUMNO: NavItem[] = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/portal/cuenta", label: "Mi cuenta", icon: Wallet },
  { href: "/portal/certificados", label: "Certificados", icon: Award },
];

const ITEMS_PROFESOR: NavItem[] = [
  { href: "/portal/dictado", label: "Mis cohortes", icon: Users },
  { href: "/portal/horas", label: "Mis horas", icon: CalendarClock },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function PortalNav({
  branding,
  userName,
  audience,
  courses,
  theme,
}: {
  branding: Branding;
  userName: string;
  audience: PortalAudience;
  /**
   * Las cursadas del alumno, para saltar a una sin pasar por el inicio. Vacío
   * para un profesor puro: un grupo con encabezado y nada debajo parece un
   * error de carga.
   */
  courses: PortalNavCourse[];
  theme: ThemePreference;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  // El cajón del celular se cierra al navegar. Sin esto, tocar un enlace
  // cambia la pantalla detrás de un panel que sigue tapándola.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Escape cierra: es lo que espera cualquiera que abrió algo por error.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  const rol =
    audience.isStudent && audience.isTeacher
      ? "Alumno y profesor"
      : audience.isTeacher
        ? "Profesor"
        : "Alumno";

  const cursadas = courses.filter((c) => c.active);
  const cerradas = courses.filter((c) => !c.active);

  const contenido = (
    <>
      <Link
        href="/portal"
        className="mb-5 flex items-center gap-2.5 px-2"
        aria-label={`${branding.name} — inicio del portal`}
      >
        <span
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-brand text-[16px] font-bold text-on-accent"
          aria-hidden
        >
          {branding.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-[650] leading-tight tracking-tight">
            {branding.name}
          </span>
          <span className="block text-[11px] text-text-3">Mi portal</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-4 overflow-y-auto">
        {audience.isStudent && (
          <Grupo label="Mi cursada" items={ITEMS_ALUMNO} pathname={pathname} />
        )}

        {audience.isStudent && cursadas.length > 0 && (
          <ListaCursos titulo="Cursando" cursos={cursadas} pathname={pathname} />
        )}

        {audience.isTeacher && (
          <Grupo label="Doy clase" items={ITEMS_PROFESOR} pathname={pathname} />
        )}

        {audience.isStudent && cerradas.length > 0 && (
          <ListaCursos
            titulo={`Terminadas (${cerradas.length})`}
            cursos={cerradas}
            pathname={pathname}
          />
        )}
      </nav>

      <div className="flex-1" />

      <div className="mt-3 flex items-center gap-2.5 rounded-md px-2.5 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block text-[11px] text-text-3">{rol}</span>
        </span>
        <ThemeToggle initial={theme} size="compact" />
        <button
          type="button"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded p-1 text-text-3 transition-colors hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Escritorio: la barra, siempre presente. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-subtle px-3 pb-3.5 pt-4 md:flex">
        {contenido}
      </aside>

      {/*
        Celular: encabezado fijo + cajón. El botón mide 44px porque es el
        mínimo para un pulgar, y el portal se usa parado en un aula.
      */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-subtle px-2 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir el menú"
          aria-expanded={abierto}
          className="flex h-11 w-11 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" strokeWidth={1.7} />
        </button>
        <Link href="/portal" className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand text-[13px] font-bold text-on-accent"
            aria-hidden
          >
            {branding.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold">{branding.name}</span>
        </Link>
        <div className="flex-1" />
        <ThemeToggle initial={theme} />
      </header>

      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar el menú"
            className="absolute inset-0 bg-overlay"
            onClick={() => setAbierto(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border bg-subtle px-3 pb-3.5 pt-4 shadow-pop">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el menú"
              className="absolute right-2 top-3 flex h-11 w-11 items-center justify-center rounded-md text-text-3 transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" strokeWidth={1.7} />
            </button>
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}

function Grupo({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
        {label}
      </span>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 44px de alto en celular, 38 en escritorio: el pulgar necesita
              // el blanco, el mouse no.
              "flex min-h-[44px] items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors md:min-h-0",
              active
                ? "bg-brand-tint font-semibold text-brand-text"
                : "text-text-2 hover:bg-accent"
            )}
          >
            <item.icon
              className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-text-3")}
              strokeWidth={1.7}
            />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function ListaCursos({
  titulo,
  cursos,
  pathname,
}: {
  titulo: string;
  cursos: PortalNavCourse[];
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
        {titulo}
      </span>
      {cursos.map((c) => {
        const href = `/portal/cursadas/${c.enrollmentId}`;
        const active = pathname === href;
        return (
          <Link
            key={c.enrollmentId}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm transition-colors md:min-h-0",
              active
                ? "bg-brand-tint font-semibold text-brand-text"
                : "text-text-2 hover:bg-accent"
            )}
          >
            <GraduationCap
              className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand" : "text-text-3")}
              strokeWidth={1.7}
            />
            <span className="truncate">{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
