"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 021 — Iniciar sesión.
 *
 * Sin tarjeta: dentro del caparazón de dos columnas, una tarjeta sobre el
 * fondo es un borde que no separa nada de nada. El formulario ES la columna.
 *
 * Tres cosas que no son cosméticas:
 *
 * 1. **El ojo de la contraseña.** Los accesos al portal se entregan con una
 *    contraseña generada que alguien dicta por teléfono (014). Sin poder
 *    verla, el primer intento falla y la persona no sabe si escribió mal o si
 *    le dictaron mal.
 * 2. **El error dice qué hacer.** "Correo o contraseña incorrectos" no dice
 *    cuál de los dos, a propósito —decirlo confirmaría qué correos existen—,
 *    pero sí dice cómo salir.
 * 3. **Entra por `/`, no por `/inbox`.** La raíz decide: el staff ve su
 *    panel, y alumnos y profesores caen en `/portal`. Mandar a todo el mundo a
 *    la bandeja rompía dos veces — un profesor rebotaba, y alguien del staff
 *    sin `inbox.ver` se estrellaba contra un 403 justo al entrar.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn.email({ email, password });
    setLoading(false);
    if (err) {
      setError(
        err.status === 429
          ? "Demasiados intentos seguidos. Esperá unos minutos y volvé a probar."
          : "El correo o la contraseña no coinciden. Revisá que no haya quedado un espacio de más."
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">
          Entrá con el correo que le diste a la academia.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="nombre@correo.com"
            className="h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              type={verClave ? "text" : "password"}
              autoComplete="current-password"
              required
              className="h-11 pr-11"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              aria-label={verClave ? "Ocultar la contraseña" : "Mostrar la contraseña"}
              aria-pressed={verClave}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-text-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {verClave ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p
            id="login-error"
            role="alert"
            className="rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-sm" loading={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      {/*
        No hay "olvidé mi contraseña" porque no hay recuperación por correo
        todavía, y un enlace que no lleva a ningún lado es peor que su ausencia:
        enseña a desconfiar de lo que dice la pantalla. Lo que sí se puede
        hacer —pedirle a la academia que la regenere— se dice con esas palabras.
      */}
      <p className="text-sm text-muted-foreground">
        ¿No podés entrar? Escribile a la academia y te generan un acceso nuevo.
      </p>

      <p className="border-t border-border pt-5 text-sm text-muted-foreground">
        ¿Estás instalando el sistema?{" "}
        <Link
          href="/register"
          className="font-medium text-brand-text underline underline-offset-4"
        >
          Crear la cuenta inicial
        </Link>
      </p>
    </div>
  );
}
