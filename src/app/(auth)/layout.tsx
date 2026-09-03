import { CalendarClock, GraduationCap, Wallet } from "lucide-react";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";

/**
 * 021 — La pantalla de acceso.
 *
 * Es la única superficie del producto que ve **todo el mundo**: los 340
 * alumnos, los profesores y el equipo. Hasta acá era una tarjeta de 384px
 * centrada en un fondo gris — correcta y anónima, la misma que sale de
 * cualquier plantilla.
 *
 * La composición es la del bloque `login-02` de shadcn: formulario a un lado,
 * panel de marca al otro. Se eligió por una razón de contenido y no de
 * estética — mucha de la gente que entra acá lo hace por PRIMERA vez, con una
 * contraseña que le dictaron por teléfono, y no sabe bien qué es esto. El
 * panel es el lugar donde eso se explica sin ensuciar el formulario.
 *
 * En celular el panel no se muestra: ahí la única tarea es entrar, y una
 * portada empujando el formulario abajo del pliegue es una portada que estorba.
 * Lo que queda es la marca arriba, chica.
 *
 * `data-surface="portal"` — la misma intensidad que el portal (020/T021). El
 * acceso no es una pantalla de trabajo: es la puerta.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);

  return (
    <div
      data-surface="portal"
      className="grid min-h-screen bg-background lg:grid-cols-[1fr_1fr] xl:grid-cols-[5fr_6fr]"
    >
      {/* ── La tarea: entrar ─────────────────────────────────────── */}
      <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-9 flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand text-lg font-bold text-on-accent"
              aria-hidden
            >
              {branding.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold leading-tight tracking-tight">
                {branding.name}
              </span>
              <span className="block text-xs text-text-3">Gestión Academia</span>
            </span>
          </div>

          {children}
        </div>
      </main>

      {/* ── La marca: qué es esto ────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-brand lg:block">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <div className="brand-grid-veil absolute inset-0" aria-hidden />

        {/*
          Centrado y no anclado abajo: con el texto al pie, en un monitor de
          1080 quedaba media pantalla de grilla vacía arriba y la composición
          se leía como un error de carga, no como una decisión.
        */}
        <div className="relative flex h-full flex-col justify-center p-12 xl:p-16">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-on-accent">
            Tu cursada, en un solo lugar.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-on-accent opacity-90">
            Acá vive todo lo que hoy se pregunta por WhatsApp: cuándo es tu
            próxima clase, cómo venís de asistencia, qué te falta pagar y dónde
            está tu certificado.
          </p>

          <ul className="mt-9 space-y-3.5">
            {[
              { Icon: CalendarClock, text: "Tu próxima clase, con el enlace de la reunión" },
              { Icon: GraduationCap, text: "Tu asistencia y tus evaluaciones, al día" },
              { Icon: Wallet, text: "Tus cuotas y tus pagos, en tu moneda" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-on-accent">
                <span className="on-brand-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-md border">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="opacity-95">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
