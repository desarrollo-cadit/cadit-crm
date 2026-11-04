"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";
import {
  comandoDeConexion,
  estadoDeToken,
  ordenarTokens,
  textoDeUltimoUso,
  type TokenDeLista,
} from "@/lib/mcp-token-ui";

/**
 * 0092 — Configuración › Conexión con Claude. Se emite un token a nombre de
 * quien lo pide, se muestra UNA vez con el comando listo para pegar, y se
 * revoca con confirmación. El valor en claro vive solo en el estado de esta
 * pantalla: no se guarda en ningún almacenamiento del navegador.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Recien = { name: string; value: string };

export function McpTokensClient({ initial }: { initial: TokenDeLista[] }) {
  const [tokens, setTokens] = useState(initial);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recien, setRecien] = useState<Recien | null>(null);
  const [copiado, setCopiado] = useState<"valor" | "comando" | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  async function recargar() {
    const res = await fetch("/api/settings/mcp-tokens").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as { tokens?: TokenDeLista[] } | null;
    if (data?.tokens) setTokens(data.tokens);
  }

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nombre }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error?.message ?? "No se pudo crear el token.";
        setError(msg);
        notify.error(msg);
        return;
      }
      setRecien({ name: data.token.name, value: data.value });
      setCopiado(null);
      setNombre("");
      await recargar();
    } finally {
      setCreando(false);
    }
  }

  async function copiar(que: "valor" | "comando", texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
    } catch {
      notify.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  async function revocar(t: TokenDeLista) {
    const aviso = `¿Revocar el token «${t.name}»? Quien lo use va a dejar de poder conectarse desde el próximo pedido.`;
    if (!window.confirm(aviso)) return;
    setRevocando(t.id);
    try {
      const res = await fetch(`/api/settings/mcp-tokens/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        notify.error(data?.error?.message ?? "No se pudo revocar el token.");
        return;
      }
      notify.success("Token revocado.");
      await recargar();
    } finally {
      setRevocando(null);
    }
  }

  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const lista = ordenarTokens(tokens);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Conexión con Claude</h2>
        <p className="text-sm text-muted-foreground">
          Con un token, Claude puede consultar esta instancia en lenguaje natural. El token actúa con
          tu rol y tus permisos: no da acceso a nada que vos no puedas ver. Hoy es solo de lectura.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void crear();
        }}
      >
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="mcp-nombre">Nombre del token</Label>
          <Input
            id="mcp-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
            placeholder="Claude Code de Cristina"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <Button type="submit" loading={creando} disabled={nombre.trim().length === 0}>
          <KeyRound className="h-4 w-4" aria-hidden />
          Crear token
        </Button>
      </form>

      {recien && (
        <section
          aria-live="polite"
          className="space-y-3 rounded-lg border border-warning-border bg-warning-soft p-4"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Copialo ahora: no se vuelve a mostrar.
          </p>
          <p className="text-sm">
            Token «{recien.name}». Si lo perdés, hay que revocarlo y crear otro.
          </p>
          <div className="space-y-1">
            <Label htmlFor="mcp-valor">Token</Label>
            <div className="flex gap-2">
              <Input id="mcp-valor" readOnly value={recien.value} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={() => void copiar("valor", recien.value)}>
                {copiado === "valor" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copiado === "valor" ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-comando">Comando para Claude Code</Label>
            <textarea
              id="mcp-comando"
              readOnly
              rows={3}
              value={comandoDeConexion(origen, recien.value)}
              className="w-full rounded-md border border-border bg-secondary p-2 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void copiar("comando", comandoDeConexion(origen, recien.value))}
            >
              {copiado === "comando" ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copiado === "comando" ? "Copiado" : "Copiar comando"}
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => setRecien(null)}>
            Ya lo guardé
          </Button>
        </section>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Tokens de la organización</h3>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se creó ningún token.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lista.map((t) => {
              const vigente = estadoDeToken(t) === "vigente";
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-48 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">
                      {t.name}{" "}
                      <span className="font-mono text-xs text-muted-foreground">…{t.last4}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.userName} · creado {fecha(t.createdAt)} · último uso{" "}
                      {textoDeUltimoUso(t.lastUsedAt, fecha)}
                    </p>
                  </div>
                  <Badge variant={vigente ? "success" : "secondary"}>
                    {vigente ? "Vigente" : `Revocado ${t.revokedAt ? fecha(t.revokedAt) : ""}`}
                  </Badge>
                  {vigente && (
                    <Button
                      type="button"
                      variant="outline"
                      loading={revocando === t.id}
                      onClick={() => void revocar(t)}
                    >
                      Revocar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
