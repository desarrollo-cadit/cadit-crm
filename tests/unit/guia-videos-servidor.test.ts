import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { carpetaDeVideos } from "@/server/guia-videos";

const ORIGINAL = { guia: process.env.GUIA_VIDEOS_DIR, media: process.env.MEDIA_DIR };

afterEach(() => {
  for (const [k, v] of [["GUIA_VIDEOS_DIR", ORIGINAL.guia], ["MEDIA_DIR", ORIGINAL.media]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("carpeta de los videos de la guía", () => {
  it("GUIA_VIDEOS_DIR manda sobre todo lo demás", () => {
    process.env.GUIA_VIDEOS_DIR = "/mnt/videos";
    process.env.MEDIA_DIR = "/data/media";
    expect(carpetaDeVideos()).toBe(path.resolve("/mnt/videos"));
  });

  it("sin GUIA_VIDEOS_DIR usa la carpeta guia-videos del volumen de la app (MEDIA_DIR)", () => {
    delete process.env.GUIA_VIDEOS_DIR;
    process.env.MEDIA_DIR = "/data/media";
    expect(carpetaDeVideos()).toBe(path.resolve("/data/media", "guia-videos"));
  });

  it("en desarrollo, sin ninguna de las dos, cae en ./data/guia-videos", () => {
    delete process.env.GUIA_VIDEOS_DIR;
    delete process.env.MEDIA_DIR;
    expect(carpetaDeVideos()).toBe(path.resolve(process.cwd(), "data", "guia-videos"));
  });
});
