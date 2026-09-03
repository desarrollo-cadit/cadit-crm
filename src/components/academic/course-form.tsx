"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CourseCategoryDto, CourseDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `key` sintética y estable: los módulos se borran del medio de la lista, y con
 * `key={index}` React reutiliza el DOM de la fila eliminada para la siguiente
 * — el foco y el scroll del textarea saltan al módulo equivocado.
 */
type ModuleDraft = { key: string; title: string; topics: string };

let moduleKeySeq = 0;
function newModuleKey() {
  moduleKeySeq += 1;
  return `mod-draft-${moduleKeySeq}`;
}

const LEVELS = [
  { value: "inicial", label: "Inicial" },
  { value: "intermedio", label: "Intermedio" },
  { value: "avanzado", label: "Avanzado" },
] as const;

const MODALITIES = [
  { value: "en_vivo", label: "En vivo" },
  { value: "asincronico", label: "Asincrónico" },
  { value: "presencial", label: "Presencial" },
] as const;

/** Los temas se editan como texto (uno por línea): más rápido de cargar que
 *  un input por tema, y es como el dueño los tiene escritos hoy. */
function topicsToText(topics: string[]) {
  return topics.join("\n");
}
function textToTopics(text: string) {
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * 006 — Editor del curso "padre": además del nombre y la descripción, carga
 * toda la ficha que consume el sitio comercial vía `/api/public/courses`
 * (portada, categoría, nivel, modalidad, duración, objetivos, destinatarios,
 * temario). Reemplaza al `CourseQuickForm` de 005, que solo tenía nombre y
 * descripción.
 *
 * El temario se manda entero en el PATCH (`modules`) porque el server lo
 * guarda como reemplazo total: así el orden que se ve acá es exactamente el
 * que queda persistido.
 */
export function CourseForm({
  initial,
  categories,
  onClose,
  onSaved,
  onCategoryCreated,
}: {
  initial?: CourseDto | null;
  categories: CourseCategoryDto[];
  onClose: () => void;
  onSaved: () => void;
  onCategoryCreated: (category: CourseCategoryDto) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [modality, setModality] = useState(initial?.modality ?? "");
  const [durationWeeks, setDurationWeeks] = useState(
    initial?.durationWeeks?.toString() ?? ""
  );
  const [hoursPerWeek, setHoursPerWeek] = useState(
    initial?.hoursPerWeek?.toString() ?? ""
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [syllabusUrl, setSyllabusUrl] = useState(initial?.syllabusUrl ?? "");
  const [objectives, setObjectives] = useState(
    topicsToText(initial?.learningObjectives ?? [])
  );
  const [targetAudience, setTargetAudience] = useState(initial?.targetAudience ?? "");
  const [modules, setModules] = useState<ModuleDraft[]>([]);
  /**
   * El temario se guarda por REEMPLAZO TOTAL, así que mandarlo sin haberlo
   * podido leer primero lo borraría entero. Mientras esto sea false —la
   * precarga todavía no volvió, o falló— el submit omite `modules` y el
   * servidor deja el temario existente intacto.
   */
  const [modulesLoaded, setModulesLoaded] = useState(!initial);
  const [modulesError, setModulesError] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  // 007 — un curso nuevo se publica por defecto; los talleres a medida y las
  // capacitaciones in-company se destildan para que no salgan en la web.
  const [published, setPublished] = useState(initial?.published ?? true);
  /** 009/010 — default de asistencia mínima para las cohortes de este curso. */
  const [minAttendancePct, setMinAttendancePct] = useState(
    initial?.minAttendancePct?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El temario no viene en el listado de cursos: se pide al abrir el editor.
  useEffect(() => {
    if (!initial) return;
    void (async () => {
      try {
        const res = await fetch(`/api/courses/${initial.id}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          modules: { title: string; topics: string[] }[];
        };
        setModules(
          data.modules.map((m) => ({
            key: newModuleKey(),
            title: m.title,
            topics: topicsToText(m.topics),
          }))
        );
        setModulesLoaded(true);
      } catch {
        setModulesError(true);
      }
    })();
  }, [initial]);

  async function createCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    const res = await fetch("/api/course-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { category: CourseCategoryDto };
    onCategoryCreated(data.category);
    setCategoryId(data.category.id);
    setNewCategory("");
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      tagline: tagline.trim() || null,
      categoryId: categoryId || null,
      level: level || null,
      modality: modality || null,
      durationWeeks: numberOrNull(durationWeeks),
      hoursPerWeek: numberOrNull(hoursPerWeek),
      imageUrl: imageUrl.trim() || null,
      syllabusUrl: syllabusUrl.trim() || null,
      learningObjectives: textToTopics(objectives),
      targetAudience: targetAudience.trim() || null,
      published,
      minAttendancePct: minAttendancePct.trim() ? Number(minAttendancePct) : null,
      // Omitir `modules` deja el temario como está; mandarlo lo reemplaza.
      ...(modulesLoaded
        ? {
            modules: modules
              .filter((m) => m.title.trim())
              .map((m) => ({ title: m.title.trim(), topics: textToTopics(m.topics) })),
          }
        : {}),
      // Al crear, el campo viene vacío y el server deriva el slug del nombre.
      // Al editar viene precargado, así que se manda igual: reenviar el mismo
      // slug no lo cambia porque `resolveUniqueCourseSlug` se excluye a sí mismo.
      ...(slug.trim() ? { slug: slug.trim() } : {}),
    };

    const res = await fetch(initial ? `/api/courses/${initial.id}` : "/api/courses", {
      method: initial ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "No se pudo guardar el curso");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">{initial ? "Editar curso" : "Nuevo curso"}</h3>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-name">Nombre</Label>
              <Input
                id="course-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-slug">Dirección web (slug)</Label>
              <Input
                id="course-slug"
                value={slug}
                placeholder={initial ? undefined : "se genera del nombre"}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tu sitio la usa como /cursos/{slug.trim() || "nombre-del-curso"}
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-md border p-3">
            <Checkbox
              className="mt-0.5"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">
                Publicar en el catálogo web
              </span>
              <span className="block text-xs text-muted-foreground">
                Destildalo para talleres a medida y capacitaciones in-company:
                el curso sigue existiendo en el CRM, con sus cohortes e
                inscripciones, pero no aparece en tu sitio ni recibe leads del
                formulario público.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="course-tagline">Frase corta</Label>
            <Input
              id="course-tagline"
              value={tagline}
              placeholder="Aparece en la tarjeta del catálogo"
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-description">Descripción</Label>
            <Textarea
              id="course-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-category">Categoría</Label>
            <select
              id="course-category"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                value={newCategory}
                placeholder="Crear categoría nueva…"
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newCategory.trim()}
                onClick={() => void createCategory()}
              >
                Agregar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-level">Nivel</Label>
              <select
                id="course-level"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="">Sin definir</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-modality">Modalidad</Label>
              <select
                id="course-modality"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={modality}
                onChange={(e) => setModality(e.target.value)}
              >
                <option value="">Sin definir</option>
                {MODALITIES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-weeks">Duración (semanas)</Label>
              <Input
                id="course-weeks"
                inputMode="numeric"
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-hours">Horas por semana</Label>
              <Input
                id="course-hours"
                inputMode="numeric"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-minasist">Asistencia mínima (%)</Label>
              <Input
                id="course-minasist"
                inputMode="numeric"
                placeholder="ej. 75"
                value={minAttendancePct}
                onChange={(e) => setMinAttendancePct(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Cada cohorte puede pisarlo. Vacío = sin requisito de presencia.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-image">URL de la imagen</Label>
              <Input
                id="course-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-syllabus">URL del temario (PDF)</Label>
              <Input
                id="course-syllabus"
                value={syllabusUrl}
                onChange={(e) => setSyllabusUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-objectives">Qué vas a aprender</Label>
            <Textarea
              id="course-objectives"
              rows={4}
              value={objectives}
              placeholder="Un objetivo por línea"
              onChange={(e) => setObjectives(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-audience">A quién está dirigido</Label>
            <Textarea
              id="course-audience"
              rows={3}
              value={targetAudience}
              placeholder="Perfil del alumno y conocimientos previos"
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Temario</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!modulesLoaded}
                onClick={() =>
                  setModules((prev) => [
                    ...prev,
                    { key: newModuleKey(), title: "", topics: "" },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Módulo
              </Button>
            </div>
            {modulesError ? (
              <p className="text-xs text-destructive">
                No se pudo cargar el temario. Podés guardar el resto del curso —
                el temario queda como estaba—, pero para editarlo cerrá y volvé
                a abrir esta ventana.
              </p>
            ) : !modulesLoaded ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              modules.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sin módulos todavía. Tu sitio muestra el temario en este orden.
                </p>
              )
            )}
            {modules.map((m, i) => (
              <div key={m.key} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={m.title}
                    placeholder="Título del módulo"
                    onChange={(e) =>
                      setModules((prev) =>
                        prev.map((mod, idx) =>
                          idx === i ? { ...mod, title: e.target.value } : mod
                        )
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar módulo ${i + 1}`}
                    onClick={() =>
                      setModules((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  className="mt-2"
                  rows={3}
                  value={m.topics}
                  placeholder="Un tema por línea"
                  onChange={(e) =>
                    setModules((prev) =>
                      prev.map((mod, idx) =>
                        idx === i ? { ...mod, topics: e.target.value } : mod
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
