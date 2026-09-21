import { cn } from "@/lib/utils";

/**
 * La marca de CAD IT, siempre sobre su plato.
 *
 * Los dos archivos son transparentes y están dibujados para fondo claro. Medido
 * con `contrastRatio()` —que existe justamente para no decidir esto a ojo— el
 * navy de "IT" y "SOLUTION PROVIDER" da 15.88:1 sobre blanco y **1.16:1 sobre
 * el fondo oscuro**: desaparece. El isotipo azul tampoco zafa, 2.95:1 sobre
 * `--bg` oscuro, por debajo del 3:1 que WCAG 1.4.11 pide para un elemento no
 * textual.
 *
 * Por eso la marca no se apoya nunca en la superficie de la página: va sobre
 * `--brand-plate`, que vale blanco en los DOS temas. Así los dos archivos se
 * miden siempre contra blanco (6.23:1 y 15.88:1) y el tema deja de ser una
 * variable. La alternativa era recolorear el navy para el tema oscuro, y eso es
 * decidir por la marca; el plato no decide nada.
 *
 * Las medidas del plato las pone quien llama, porque cada barra tiene la suya.
 */

/*
  Se usa `<img>` y no `next/image`: son dos archivos estáticos de 11 y 23 KB
  servidos desde `public/`, y el optimizador de Next exige `sharp` dentro del
  contenedor standalone para no romper en producción. Ganancia nula, una
  dependencia de runtime más — y la constitución (Principio II) es explícita.
*/

export function IsotipoCadIT({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand-plate p-[2px]",
        className
      )}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-cadit-isotipo.webp"
        alt=""
        width={512}
        height={512}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function LogoCadIT({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex items-center justify-center bg-brand-plate", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-cadit-completo.webp"
        alt="CAD IT Solution Provider"
        width={1000}
        height={400}
        className="h-auto w-full"
      />
    </span>
  );
}
