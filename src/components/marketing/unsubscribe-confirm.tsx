"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 045 (DV-010, P-01) — El segundo paso de la baja: un botón. Los filtros de
 * seguridad del correo abren los enlaces solos; si la baja ocurriera al abrir
 * la página, daría de baja a gente que nunca lo pidió.
 */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const [estado, setEstado] = useState<"inicial" | "enviando" | "listo" | "error">("inicial");

  async function confirmar() {
    setEstado("enviando");
    const res = await fetch("/api/public/marketing/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setEstado(res?.ok ? "listo" : "error");
  }

  if (estado === "listo") {
    return <p className="text-sm font-medium">Listo. Ya no te vamos a enviar correos de novedades.</p>;
  }
  return (
    <div className="space-y-2">
      <Button onClick={() => void confirmar()} loading={estado === "enviando"}>
        Confirmar la baja
      </Button>
      {estado === "error" && (
        <p className="text-sm text-danger">No pudimos registrar la baja. Probá de nuevo en unos minutos.</p>
      )}
    </div>
  );
}
