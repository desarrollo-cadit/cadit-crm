import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-on-accent",
        secondary: "border bg-secondary text-text-2",
        outline: "text-foreground",
        /*
          020 (T004/T011) — Eran seis hex escritos a mano. En un primitivo eso
          es peor que en una pantalla: el badge se repite en toda la cursada y
          era lo único que no respondía ni al tema ni a la corrección de
          contraste. Ahora sale de tokens, y el test de contraste los alcanza.
        */
        success: "border-success-border bg-success-soft text-success",
        warning: "border-warning-border bg-warning-soft text-warning",
        destructive: "border-danger-border bg-danger-soft text-danger",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
