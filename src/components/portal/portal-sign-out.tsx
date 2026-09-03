"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";

/** 014 — Salir del portal. Mismo comportamiento que el del panel. */
export function PortalSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      // 44px de lado: el mínimo para un dedo. El portal se usa en el celular.
      className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={async () => {
        await signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-5 w-5" strokeWidth={1.7} />
    </button>
  );
}
