"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Curso = {
  id: string;
  name: string;
  listPrice: number | null;
  listCurrency: string | null;
  cohortes: number;
  cohortesConPrecioPropio: number;
};

type Profesor = {
  id: string;
  name: string;
  email: string | null;
  cohortes: number;
  tieneAcceso: boolean;
};

type Estado = {
  cursosSinPrecio: number;
  cursosTotal: number;
  profesoresSinCorreo: number;
  profesoresTotal: number;
  inscripcionesSinMonto: number;
};

/**
 * 011 — Lo que falta cargar.
 *
 * No es una pantalla de configuración más: es una **lista de tareas medida**.
 * El problema que resuelve lo mostró la medición, cuatro veces seguidas en
 * distintas fases — el código va muy por delante de los datos, y editar 34
 * cursos de a uno abriendo un formulario cada vez es trabajo que no se hace.
 *
 * Por eso todo se edita EN LÍNEA y se guarda junto, y por eso arriba hay
 * números: "faltan 34 precios" es una tarea con final; "cargá los precios" es
 * un cartel.
 */
export function CargaRapidaClient() {
  const [cursos, setCursos] = useState<Curso[] | null>(null);
  const [profesores, setProfesores] = useState<Profesor[] | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/carga-rapida").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as {
      estado: Estado;
      cursos: Curso[];
      profesores: Profesor[];
    };
    setEstado(d.estado);
    setCursos(d.cursos);
    setProfesores(d.profesores);
    setSucio(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function guardar() {
    if (!cursos || !profesores) return;
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/settings/carga-rapida", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        precios: cursos.map((c) => ({
          courseId: c.id,
          listPrice: c.listPrice,
          listCurrency: c.listPrice === null ? null : (c.listCurrency ?? "UYU"),
        })),
        correos: profesores.map((p) => ({ teacherId: p.id, email: p.email ?? "" })),
      }),
    }).catch(() => null);
    setGuardando(false);

    if (!res?.ok) {
      const b = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setAviso(b?.error?.message ?? "No se pudo guardar.");
      return;
    }
    setAviso("Guardado.");
    void refetch();
  }

  if (!estado || !cursos || !profesores) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const listo =
    estado.cursosSinPrecio === 0 && estado.profesoresSinCorreo === 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Lo que falta cargar</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            La plataforma tiene construido más de lo que tiene cargado. Estos son
            los datos que hoy bloquean algo concreto.
          </p>
        </div>
        <Button loading={guardando} disabled={!sucio} onClick={() => void guardar()}>
          Guardar todo
        </Button>
      </div>

      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Pendiente
          n={estado.cursosSinPrecio}
          de={estado.cursosTotal}
          label="cursos sin precio de lista"
          consecuencia="Sin precio, cada inscripción se carga a mano."
        />
        <Pendiente
          n={estado.profesoresSinCorreo}
          de={estado.profesoresTotal}
          label="profesores sin correo"
          consecuencia="Sin correo no pueden entrar a su portal."
        />
        <Pendiente
          n={estado.inscripcionesSinMonto}
          label="inscripciones sin monto"
          consecuencia="No se pueden facturar. Se arreglan cargando el precio del curso."
        />
      </div>

      {listo && (
        <p className="rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
          <Check className="mr-1.5 inline h-4 w-4" />
          No falta nada de esto. La gestión está cargada.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Precio de lista por curso
        </h3>
        <p className="text-xs text-muted-foreground">
          La cohorte lo hereda salvo que tenga uno propio. Los que más cohortes
          tienen van primero: cargar el precio del curso con 12 cohortes rinde
          doce veces más que el de una.
        </p>
        <ul className="divide-y rounded-lg border">
          {cursos.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{c.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.cohortes} cohorte{c.cohortes === 1 ? "" : "s"}
                  {c.cohortesConPrecioPropio > 0 &&
                    ` · ${c.cohortesConPrecioPropio} con precio propio`}
                </span>
              </span>
              <Input
                type="number"
                min={0}
                placeholder="sin precio"
                className="h-9 w-32 text-right"
                value={c.listPrice ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  setCursos((prev) =>
                    prev!.map((x, j) => (j === i ? { ...x, listPrice: v } : x))
                  );
                  setSucio(true);
                }}
              />
              <Select
                aria-label={`Moneda de ${c.name}`}
                className="h-9 w-24"
                value={c.listCurrency ?? "UYU"}
                onChange={(e) => {
                  setCursos((prev) =>
                    prev!.map((x, j) =>
                      j === i ? { ...x, listCurrency: e.target.value } : x
                    )
                  );
                  setSucio(true);
                }}
              >
                <option value="UYU">UYU</option>
                <option value="PYG">PYG</option>
                <option value="USD">USD</option>
              </Select>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Correo de los profesores
        </h3>
        <p className="text-xs text-muted-foreground">
          {/* La separación es de la 012 y se mantiene: cargar el correo y
              mandar la invitación son dos actos distintos. Un correo no se
              puede desenviar. */}
          Cargar el correo <strong>no invita a nadie</strong>. La invitación se
          manda después, de a una, desde la ficha del profesor.
        </p>
        <ul className="divide-y rounded-lg border">
          {profesores.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.cohortes} cohorte{p.cohortes === 1 ? "" : "s"}
                  {p.tieneAcceso && " · ya tiene acceso"}
                </span>
              </span>
              <Input
                type="email"
                placeholder="sin correo"
                className="h-9 w-72"
                value={p.email ?? ""}
                onChange={(e) => {
                  setProfesores((prev) =>
                    prev!.map((x, j) =>
                      j === i ? { ...x, email: e.target.value || null } : x
                    )
                  );
                  setSucio(true);
                }}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Pendiente({
  n,
  de,
  label,
  consecuencia,
}: {
  n: number;
  de?: number;
  label: string;
  consecuencia: string;
}) {
  const hecho = n === 0;
  return (
    <div
      className={`rounded-lg border p-4 ${
        hecho ? "bg-card" : "border-warning-border bg-warning-soft"
      }`}
    >
      <p
        className={`text-3xl font-semibold tabular-nums ${
          hecho ? "text-muted-foreground" : "text-warning"
        }`}
      >
        {n}
        {de !== undefined && (
          <span className="text-base font-normal text-muted-foreground"> de {de}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
      {/* La consecuencia, no solo el número: un pendiente que no dice qué
          bloquea es un número que nadie prioriza. */}
      <p className="mt-1.5 text-xs text-muted-foreground">{consecuencia}</p>
    </div>
  );
}
