"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { HOME_AFTER_PASSWORD_CHANGE } from "@/lib/auth/password-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * El formulario de `/cambiar-contrasena`, con dos textos según el caso:
 *
 * - **Forzado**: la contraseña la generó la academia y viajó por correo. Se
 *   explica por qué se pide, en una frase, y se ofrece cerrar sesión: quien
 *   llegó acá sin querer no tiene que quedar atrapado.
 * - **Voluntario**: se entra desde el menú y se puede volver sin cambiar nada.
 *
 * Que las dos nuevas coincidan se comprueba acá para ahorrar un viaje; todo
 * lo demás (largo, que no sea la misma, que la actual sea correcta) lo decide
 * el servidor, que es la autoridad.
 */
export function PasswordChangeForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva !== repetida) {
      setError("Las dos contraseñas nuevas no coinciden. Volvé a escribirlas.");
      return;
    }
    setLoading(true);
    let res: Response;
    try {
      res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: actual, newPassword: nueva }),
      });
    } catch {
      setLoading(false);
      setError("No pudimos comunicarnos con el campus. Revisá tu conexión y volvé a intentarlo.");
      return;
    }
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setLoading(false);
      setError(
        json?.error?.message ??
          "No pudimos guardar la contraseña. Volvé a intentarlo en unos minutos."
      );
      return;
    }
    router.push(HOME_AFTER_PASSWORD_CHANGE);
    router.refresh();
  }

  const describedBy = error ? "cambio-error" : undefined;

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {forced ? "Elegí tu contraseña" : "Cambiar contraseña"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {forced
            ? "La contraseña con la que entraste la generó la academia y te llegó por correo. Para cuidar tu cuenta, te pedimos que elijas una propia antes de seguir."
            : "Para confirmar que sos vos, te pedimos primero la contraseña que usás hoy."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <CampoClave
          id="actual"
          label="Contraseña actual"
          hint={forced ? "La que te llegó por correo." : undefined}
          autoComplete="current-password"
          autoFocus
          value={actual}
          onChange={setActual}
          describedBy={describedBy}
          invalid={Boolean(error)}
        />
        <CampoClave
          id="nueva"
          label="Contraseña nueva"
          hint="Al menos 8 caracteres."
          autoComplete="new-password"
          value={nueva}
          onChange={setNueva}
          describedBy={describedBy}
          invalid={Boolean(error)}
        />
        <CampoClave
          id="repetida"
          label="Repetí la contraseña nueva"
          autoComplete="new-password"
          value={repetida}
          onChange={setRepetida}
          describedBy={describedBy}
          invalid={Boolean(error)}
        />

        {error && (
          <p
            id="cambio-error"
            role="alert"
            className="rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-sm" loading={loading}>
          {loading ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>

      {forced ? (
        <p className="text-sm text-muted-foreground">
          ¿Preferís hacerlo en otro momento?{" "}
          <button
            type="button"
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            Cerrar sesión
          </button>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link
            href={HOME_AFTER_PASSWORD_CHANGE}
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Volver sin cambiarla
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * Cada campo lleva su propio ojo, igual que el login: la contraseña actual
 * suele ser la que llegó por correo, y poder verla es lo que evita un primer
 * intento fallido por una letra mal copiada.
 */
function CampoClave({
  id,
  label,
  hint,
  autoComplete,
  autoFocus,
  value,
  onChange,
  describedBy,
  invalid,
}: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  invalid: boolean;
}) {
  const [ver, setVer] = useState(false);
  const hintId = hint ? `${id}-ayuda` : undefined;
  const descripcion = [hintId, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={ver ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          className="h-11 pr-11"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={descripcion}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? `Ocultar: ${label.toLowerCase()}` : `Mostrar: ${label.toLowerCase()}`}
          aria-pressed={ver}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-text-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {ver ? (
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
