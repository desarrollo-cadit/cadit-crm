import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = { label: string; href: string | null };

/**
 * 029 — Migas de pan. Solo tokens de color y accesible por construcción:
 * `nav` con nombre propio, lista ordenada, y el último paso —donde uno está—
 * marcado con `aria-current="page"` en vez de ser un enlace a sí mismo.
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: readonly BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Migas de pan" className={cn("text-xs", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        {items.map((item, i) => {
          const ultimo = i === items.length - 1;
          return (
            <li key={`${i}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {ultimo || !item.href ? (
                <span
                  aria-current={ultimo ? "page" : undefined}
                  className={cn("truncate", ultimo && "font-medium text-foreground")}
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="truncate hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              )}
              {!ultimo && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
