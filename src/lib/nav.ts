import {
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Inbox,
  Kanban,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 027 (FR-004) — La navegación, declarada UNA vez y del lado del servidor.
 *
 * Estas listas vivían adentro de `app-nav.tsx` y `portal-nav.tsx`, que son
 * componentes `"use client"`. Mientras el único lector fuera el propio menú
 * daba igual; con la guía por rol dejó de darlo, porque la guía se renderiza
 * en el servidor y necesita leer los mismos destinos.
 *
 * La salida fácil habría sido copiarlas. **Lo que no se admite es una segunda
 * copia**: dos listas de navegación divergen, y la que diverge es siempre la
 * que nadie mira. Por eso la declaración se mudó acá —un módulo sin
 * `"use client"`, importable desde los dos lados— y los componentes la leen.
 *
 * Los íconos de `lucide-react` viajan con la declaración: son componentes SVG
 * sin estado ni hooks, así que un componente de servidor puede importarlos sin
 * cruzar ninguna frontera. Separarlos habría creado exactamente la segunda
 * lista que este archivo existe para impedir.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Coincidencia exacta: `/portal` no se enciende con `/portal/cuenta`. */
  exact?: boolean;
};

/**
 * 012 (T029) — Cada destino declara la capacidad que exige.
 *
 * El menú se arma con lo que la sesión PUEDE, no con lo que existe. Un ítem
 * que lleva a un 403 no es información: es una puerta cerrada con cartel de
 * bienvenida, y enseña a la gente a desconfiar de lo que ve.
 *
 * `capability: null` = visible para cualquier miembro del staff (el Dashboard
 * decide por dentro qué paneles mostrar según capacidades).
 */
export const NAV_GROUPS = [
  {
    label: "Inicio",
    items: [
      { href: "/", label: "Dashboard", icon: Kanban, capability: null },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/inbox", label: "Bandeja", icon: Inbox, badge: "unread", capability: "inbox.ver" },
      { href: "/pipeline", label: "Pipeline", icon: Kanban, capability: "inscripciones.ver" },
      {
        href: "/contacts",
        label: "Alumnos",
        icon: Users,
        badge: "formArrivals",
        capability: "contactos.ver",
      },
      // 013 (T033) — Sustituye al portal corporativo descartado: el staff mira
      // y exporta el avance de los empleados de cada empresa.
      { href: "/empresas", label: "Empresas", icon: Building2, capability: "contactos.ver" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/academico", label: "Académico", icon: GraduationCap, capability: "academico.ver" },
      { href: "/calendar", label: "Calendario", icon: CalendarDays, capability: "academico.ver" },
    ],
  },
  // {
  //   label: "Inteligencia artificial",
  //   items: [
  //     { href: "/agent", label: "Agente", icon: Sparkles },
  //     { href: "/lab", label: "Laboratorio", icon: FlaskConical },
  //   ],
  // },
] as const;

/**
 * 027 (FR-008/FR-012) — La guía, abajo de todo y sin permiso.
 *
 * Va junto a Ajustes y no en un grupo de trabajo porque es una utilidad: no se
 * entra a la guía a hacer algo, se entra a averiguar cómo hacerlo.
 *
 * `capability: null` es la parte que importa: **un manual que hay que tener
 * permiso para leer no es un manual**. Quien menos permisos tiene es
 * justamente quien más necesita saber qué puede y qué no.
 */
export const ITEM_GUIA = {
  href: "/guia",
  label: "Guía",
  icon: BookOpen,
  capability: null,
} as const;

/**
 * Ajustes no lleva `capability` porque su puerta es compuesta —entra quien
 * puede configurar **o** gestionar accesos— y eso no cabe en un solo nombre.
 * El gate real vive en `settings/layout.tsx`; acá sólo está el destino.
 */
export const ITEM_AJUSTES = {
  href: "/settings",
  label: "Ajustes",
  icon: Settings,
} as const;

/**
 * Los destinos del menú, aplanados, para quien necesita responder "¿dónde
 * está X?" sin volver a recorrer la estructura.
 *
 * `grupo: null` es la zona inferior (guía y ajustes), que en la barra no tiene
 * encabezado. Se DERIVA de `NAV_GROUPS`: agregar un ítem al menú lo hace
 * aparecer acá solo.
 */
export const DESTINOS_MENU: readonly {
  grupo: string | null;
  label: string;
  href: string;
  capability: string | null;
}[] = [
  ...NAV_GROUPS.flatMap((g) =>
    g.items.map((i) => ({
      grupo: g.label as string,
      label: i.label as string,
      href: i.href as string,
      capability: i.capability as string | null,
    }))
  ),
  { grupo: null, label: ITEM_GUIA.label, href: ITEM_GUIA.href, capability: null },
  { grupo: null, label: ITEM_AJUSTES.label, href: ITEM_AJUSTES.href, capability: null },
];

/** 014/021 — Las dos audiencias del portal, que pueden darse a la vez. */
export type PortalAudience = {
  isStudent: boolean;
  isTeacher: boolean;
};

/**
 * `as const satisfies` y no una anotación de tipo: el `as const` conserva los
 * `href` como literales —de ahí sale `HrefAlumno`, y con él la exhaustividad
 * de la guía del portal— y el `satisfies` sigue exigiendo que cada ítem tenga
 * la forma de un `NavItem`.
 */
export const ITEMS_ALUMNO = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/portal/cuenta", label: "Mi cuenta", icon: Wallet },
  { href: "/portal/certificados", label: "Certificados", icon: Award },
] as const satisfies readonly NavItem[];

export const ITEMS_PROFESOR = [
  { href: "/portal/dictado", label: "Mis cohortes", icon: Users },
  { href: "/portal/horas", label: "Mis horas", icon: CalendarClock },
] as const satisfies readonly NavItem[];

/**
 * 027 (FR-012) — La guía del portal vive en la zona COMÚN, fuera de los dos
 * grupos: quien es alumno y profesor a la vez tendría dos enlaces a la misma
 * pantalla, y quien es sólo una de las dos cosas la vería colgando de un
 * grupo al que no pertenece.
 */
export const ITEM_GUIA_PORTAL = {
  href: "/portal/guia",
  label: "Cómo funciona esto",
  icon: BookOpen,
} as const satisfies NavItem;

export type HrefAlumno = (typeof ITEMS_ALUMNO)[number]["href"];
export type HrefProfesor = (typeof ITEMS_PROFESOR)[number]["href"];
