import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImageMime } from "@/server/course-image";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("portada del curso subida desde el CRM", () => {
  it("deduce el tipo por los primeros bytes", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(
      sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))
    ).toBe("image/png");
    expect(sniffImageMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
  });

  it("cualquier otra cosa no se sirve como imagen", () => {
    expect(sniffImageMime(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageMime(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });

  it("subir exige la capacidad de staff; servir es público y con alcance", () => {
    const upload = read("src/app/api/courses/[id]/image/route.ts");
    expect(upload).toContain('requireCapability(\n  "academico.editar"');
    const serve = read("src/app/api/public/courses/[id]/image/route.ts");
    expect(serve).toContain("withOrganization(");
    expect(serve).toContain("nosniff");
  });

  it("el formulario sube el archivo después de guardar el curso", () => {
    const form = read("src/components/academic/course-form.tsx");
    expect(form).toContain("fetch(`/api/courses/${courseId}/image`, { method: \"PUT\", body })");
    expect(form).not.toContain("URL de la imagen");
  });
});
