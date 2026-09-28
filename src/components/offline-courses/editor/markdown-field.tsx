"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/offline-courses/markdown";
import { cn } from "@/lib/utils";

/**
 * cursos-offline T11b — A markdown textarea with a preview drawn by the SAME
 * renderer the student portal uses: what the preview shows is what the
 * student gets, including what it does not support (it stays as text).
 */
export function MarkdownField({
  label,
  value,
  onChange,
  rows = 6,
  disabled,
  hint = "Admite **negrita**, *cursiva*, listas, títulos con # y enlaces [texto](https://…).",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex rounded-md border p-0.5 text-xs" role="group" aria-label={`Modo de «${label}»`}>
          {[
            { on: false, text: "Escribir" },
            { on: true, text: "Vista previa" },
          ].map((tab) => (
            <button
              key={tab.text}
              type="button"
              aria-pressed={preview === tab.on}
              onClick={() => setPreview(tab.on)}
              className={cn(
                "rounded px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                preview === tab.on ? "bg-brand-tint font-medium text-brand-text" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {tab.text}
            </button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="min-h-[60px] rounded-md border bg-subtle px-3 py-2">
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nada para previsualizar.</p>
          )}
        </div>
      ) : (
        <Textarea id={id} rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
