"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCopy, FileText, Plus } from "lucide-react";
import type { CourseDto, IntakeFormDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function FormsClient() {
  const [forms, setForms] = useState<IntakeFormDto[]>([]);
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const [formsRes, coursesRes] = await Promise.all([
      fetch("/api/intake-forms").catch(() => null),
      fetch("/api/courses").catch(() => null),
    ]);
    if (formsRes?.ok) {
      const data = (await formsRes.json()) as { forms: IntakeFormDto[] };
      setForms(data.forms);
    }
    if (coursesRes?.ok) {
      const data = (await coursesRes.json()) as { courses: CourseDto[] };
      setCourses(data.courses);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Cada formulario tiene una URL pública de envío para pegar en tu sitio
        externo. Los contactos que lleguen así quedan marcados con un tag de
        origen «Formulario: nombre» en la tabla de Contactos, y si el
        formulario está atado a un curso, su tarjeta del pipeline muestra ese
        curso como interés.
      </p>

      <CourseEndpointNote />

      <CreateForm courses={courses} onCreated={() => void refetch()} />

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : forms.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin formularios todavía. Crea el primero arriba para obtener su
            URL de envío.
          </p>
        ) : (
          forms.map((f) => <FormCard key={f.id} form={f} />)
        )}
      </div>
    </div>
  );
}

/**
 * 005 iteración 8 — cada curso del catálogo ya tiene su URL de captación sin
 * que haya que crear nada acá. Sin este aviso el dueño termina creando un
 * formulario por curso a mano, que es justo lo que la ruta por curso evita.
 */
function CourseEndpointNote() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Un formulario por curso? No hace falta</CardTitle>
        <CardDescription>
          Cada curso del catálogo ya tiene su propia URL de captación, con su
          dirección web (slug). El lead entra atribuido a ese curso solo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          readOnly
          value={`${origin}/api/public/courses/<slug-del-curso>/submit`}
          className="font-mono text-xs"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Los formularios de acá abajo son para campañas con nombre propio
          («Feria 2026», «Anuncio de septiembre»), cuando querés distinguir el
          origen del genérico del catálogo.
        </p>
      </CardContent>
    </Card>
  );
}

function CreateForm({
  courses,
  onCreated,
}: {
  courses: CourseDto[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/intake-forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        courseId: courseId || undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear el formulario");
      return;
    }
    setName("");
    setCourseId("");
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo formulario</CardTitle>
        <CardDescription>
          Ata el formulario a un curso de interés (opcional) o déjalo
          genérico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Nombre</Label>
            <Input
              id="form-name"
              placeholder="Landing Revit"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-course">Curso de interés (opcional)</Label>
            <select
              id="form-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Genérico (sin curso)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={saving || !name.trim()} onClick={() => void create()}>
          <Plus className="h-4 w-4" />
          {saving ? "Creando…" : "Crear formulario"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FormCard({ form }: { form: IntakeFormDto }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const url = `${origin}/api/public/forms/${form.id}/submit`;
  const snippet = `fetch("${url}", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Nombre del interesado",
    lastName: "opcional — apellido, si tu formulario lo pide aparte",
    phone: "5215512345678",
    email: "opcional@ejemplo.com",
    message: "opcional — lo que el interesado escriba en el campo mensaje",
  }),
});`;
  const curlSnippet = `curl -X POST "${url}" \\
  -H "content-type: application/json" \\
  -d '{"name":"Nombre","lastName":"Apellido","phone":"5215512345678"}'`;

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle>{form.name}</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {form.courseName ? `Curso: ${form.courseName}` : "Genérico"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            <ClipboardCopy className="h-4 w-4" />
            {copied ? "Copiado ✓" : "Copiar"}
          </Button>
        </div>
        <details className="rounded-md border bg-subtle p-3 text-xs">
          <summary className="cursor-pointer select-none font-medium">
            Ver snippet de ejemplo (fetch / curl)
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {snippet}
          </pre>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {curlSnippet}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
