import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 020 (T017/T018) — Los estados viven acá, en el primitivo, y no en cada
 * pantalla (FR-007). Improvisar el "cargando" pantalla por pantalla es cómo se
 * termina con cinco maneras distintas de decir lo mismo.
 *
 * **`ring-offset-2 ring-offset-background` no es decoración**: sin ese hueco,
 * el foco de un botón primario sería el acento dibujado sobre el acento —
 * invisible justo para quien navega con teclado, que es quien lo necesita. El
 * hueco del color del fondo lo separa siempre, en los dos temas.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-brand-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /**
     * 020 (T017) — Acción en curso. Deshabilita y muestra el giro, y además
     * marca `aria-busy` para que un lector de pantalla lo anuncie.
     *
     * Existe porque casi todas las pantallas ya lo resolvían a mano, cada una
     * a su manera: `{busy ? "Emitiendo…" : "Emitir"}`, un `disabled` suelto,
     * un texto que cambiaba. Todas decían lo mismo y ninguna igual.
     */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      // Un botón que está trabajando no se puede volver a apretar: el doble
      // clic accidental es la forma más común de duplicar una acción.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
