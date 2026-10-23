"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Heading,
  Image as ImageIcon,
  List,
  Minus,
  MousePointerClick,
  Pilcrow,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type { Block, CampaignBody } from "@/lib/marketing/body";

/**
 * 045 (US2; FR-007, FR-008, FR-010) — El editor de bloques del correo.
 *
 * Sin HTML libre por construcción: cada bloque de texto es un `<textarea>`,
 * así que pegar desde Word o desde la web deja TEXTO plano. El formato en
 * línea es el de la guía (negrita, cursiva, enlaces y variables).
 */

export type ImagenDeCampana = { id: string; url: string; sizeBytes: number };
export type ErrorDeCampo = { path: string; message: string };

const VARIABLES = [
  { label: "Nombre", texto: "{{nombre|colega}}" },
  { label: "Apellido", texto: "{{apellido}}" },
  { label: "Curso de interés", texto: "{{curso_de_interes|nuestros cursos}}" },
];

const NUEVO: Record<Block["type"], () => Block> = {
  heading: () => ({ type: "heading", level: 1, text: "" }),
  paragraph: () => ({ type: "paragraph", text: "" }),
  list: () => ({ type: "list", ordered: false, items: [""] }),
  image: () => ({ type: "image", imageId: "", alt: "" }),
  button: () => ({ type: "button", label: "", url: "https://" }),
  divider: () => ({ type: "divider" }),
};

const AGREGAR: { type: Block["type"]; label: string; icon: typeof Heading }[] = [
  { type: "heading", label: "Título", icon: Heading },
  { type: "paragraph", label: "Párrafo", icon: Pilcrow },
  { type: "list", label: "Lista", icon: List },
  { type: "image", label: "Imagen", icon: ImageIcon },
  { type: "button", label: "Botón", icon: MousePointerClick },
  { type: "divider", label: "Separador", icon: Minus },
];

const NOMBRE: Record<Block["type"], string> = {
  heading: "Título",
  paragraph: "Párrafo",
  list: "Lista",
  image: "Imagen",
  button: "Botón",
  divider: "Separador",
};

export function BlockEditor({
  campaignId,
  body,
  onChange,
  images,
  onImagesChange,
  errors,
  disabled,
}: {
  campaignId: string;
  body: CampaignBody;
  onChange: (b: CampaignBody) => void;
  images: ImagenDeCampana[];
  onImagesChange: (i: ImagenDeCampana[]) => void;
  errors: ErrorDeCampo[];
  disabled: boolean;
}) {
  const ultimoTexto = useRef<{ index: number; campo: HTMLTextAreaElement | HTMLInputElement } | null>(null);
  const [subiendo, setSubiendo] = useState<number | null>(null);

  const set = (i: number, b: Block) => onChange({ ...body, blocks: body.blocks.map((x, j) => (j === i ? b : x)) });
  const quitar = (i: number) => onChange({ ...body, blocks: body.blocks.filter((_, j) => j !== i) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= body.blocks.length) return;
    const blocks = [...body.blocks];
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
    onChange({ ...body, blocks });
  };

  /** Inserta la variable donde estaba el cursor del último texto tocado. */
  function insertarVariable(texto: string) {
    const ref = ultimoTexto.current;
    const b = ref ? body.blocks[ref.index] : undefined;
    if (!ref || !b || (b.type !== "paragraph" && b.type !== "heading")) {
      notify.error("Hacé clic primero en un título o un párrafo.");
      return;
    }
    const pos = ref.campo.selectionStart ?? b.text.length;
    set(ref.index, { ...b, text: b.text.slice(0, pos) + texto + b.text.slice(pos) });
  }

  async function subir(i: number, file: File) {
    setSubiendo(i);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/images`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify.error(data?.error?.message ?? "No se pudo subir la imagen.");
        return;
      }
      const img = data as ImagenDeCampana;
      onImagesChange([...images, img]);
      const b = body.blocks[i];
      if (b?.type === "image") set(i, { ...b, imageId: img.id });
    } finally {
      setSubiendo(null);
    }
  }

  const erroresDe = (i: number) => errors.filter((e) => e.path.startsWith(`body.blocks.${i}`));

  return (
    <div className="space-y-3">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Insertar:</span>
          {VARIABLES.map((v) => (
            <Button key={v.texto} type="button" variant="outline" size="sm" onClick={() => insertarVariable(v.texto)}>
              {v.label}
            </Button>
          ))}
        </div>
      )}

      {body.blocks.length === 0 && (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          El correo está vacío. Agregá un bloque para empezar.
        </p>
      )}

      {body.blocks.map((b, i) => (
        <div key={i} className="space-y-2 rounded-md border bg-card px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{NOMBRE[b.type]}</span>
            {!disabled && (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => mover(i, -1)} aria-label="Subir bloque" disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => mover(i, 1)}
                  aria-label="Bajar bloque"
                  disabled={i === body.blocks.length - 1}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => quitar(i)} aria-label="Quitar bloque">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>

          {b.type === "heading" && (
            <div className="flex gap-2">
              <Select
                value={String(b.level)}
                onChange={(e) => set(i, { ...b, level: e.target.value === "2" ? 2 : 1 })}
                disabled={disabled}
                aria-label="Tamaño del título"
                className="w-28"
              >
                <option value="1">Grande</option>
                <option value="2">Mediano</option>
              </Select>
              <Input
                value={b.text}
                maxLength={200}
                onChange={(e) => set(i, { ...b, text: e.target.value })}
                onFocus={(e) => (ultimoTexto.current = { index: i, campo: e.currentTarget })}
                disabled={disabled}
                aria-label="Texto del título"
              />
            </div>
          )}

          {b.type === "paragraph" && (
            <Textarea
              value={b.text}
              rows={4}
              maxLength={3000}
              onChange={(e) => set(i, { ...b, text: e.target.value })}
              onFocus={(e) => (ultimoTexto.current = { index: i, campo: e.currentTarget })}
              disabled={disabled}
              aria-label="Texto del párrafo"
              placeholder="**negrita**, *cursiva*, [texto del enlace](https://…)"
            />
          )}

          {b.type === "list" && (
            <>
              <Textarea
                value={b.items.join("\n")}
                rows={3}
                onChange={(e) => set(i, { ...b, items: e.target.value.split("\n") })}
                disabled={disabled}
                aria-label="Ítems de la lista, uno por renglón"
                placeholder="Un ítem por renglón"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={b.ordered}
                  onChange={(e) => set(i, { ...b, ordered: e.target.checked })}
                  disabled={disabled}
                />
                Numerada
              </label>
            </>
          )}

          {b.type === "image" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Imagen</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={b.imageId}
                    onChange={(e) => set(i, { ...b, imageId: e.target.value })}
                    disabled={disabled}
                    aria-label="Elegí una imagen subida"
                    className="max-w-xs"
                  >
                    <option value="">Elegí una imagen…</option>
                    {images.map((img, n) => (
                      <option key={img.id} value={img.id}>
                        Imagen {n + 1} ({Math.round(img.sizeBytes / 1024)} KB)
                      </option>
                    ))}
                  </Select>
                  {!disabled && (
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs underline">
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      {subiendo === i ? "Subiendo…" : "Subir otra"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void subir(i, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {b.imageId && images.find((x) => x.id === b.imageId) && (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por token
                  <img
                    src={images.find((x) => x.id === b.imageId)!.url}
                    alt={b.alt}
                    className="mt-1 max-h-32 rounded border"
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Texto alternativo</Label>
                <Input value={b.alt} maxLength={200} onChange={(e) => set(i, { ...b, alt: e.target.value })} disabled={disabled} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Enlace al hacer clic (opcional)</Label>
                <Input
                  value={b.href ?? ""}
                  placeholder="https://"
                  onChange={(e) => {
                    const { href: _sacar, ...resto } = b;
                    set(i, e.target.value ? { ...resto, href: e.target.value } : resto);
                  }}
                  disabled={disabled}
                />
              </div>
            </div>
          )}

          {b.type === "button" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Texto del botón</Label>
                <Input value={b.label} maxLength={60} onChange={(e) => set(i, { ...b, label: e.target.value })} disabled={disabled} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Enlace (https)</Label>
                <Input value={b.url} onChange={(e) => set(i, { ...b, url: e.target.value })} disabled={disabled} />
              </div>
            </div>
          )}

          {erroresDe(i).map((e) => (
            <p key={e.path + e.message} className="text-xs text-danger">
              {e.message}
            </p>
          ))}
        </div>
      ))}

      {!disabled && (
        <div className="flex flex-wrap gap-1">
          {AGREGAR.map((a) => (
            <Button
              key={a.type}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...body, blocks: [...body.blocks, NUEVO[a.type]()] })}
              disabled={body.blocks.length >= 60}
            >
              <a.icon className="h-4 w-4" aria-hidden />
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
