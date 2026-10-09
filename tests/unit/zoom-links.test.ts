import { describe, expect, it } from "vitest";
import { buildPlayUrl, extractMeetingId } from "@/lib/zoom/links";

/**
 * 030 (DV-008, contrato zoom-adapter.md) — Las dos funciones puras del
 * adaptador. `buildPlayUrl` decide el enlace que recibe el alumno: si se
 * equivoca, el alumno abre un enlace que le pide un código que no tiene.
 * `extractMeetingId` alimenta la señal fuerte del matcher (número de reunión).
 */
describe("buildPlayUrl — el enlace final y si lleva el código embebido", () => {
  it.each([
    {
      caso: "sin share_url no hay enlace",
      input: { shareUrl: null, playPasscode: "abc" },
      esperado: { url: null, passcodeEmbedded: false },
    },
    {
      caso: "share_url que ya trae pwd= va tal cual",
      input: { shareUrl: "https://zoom.us/rec/share/AAA?pwd=xyz", playPasscode: "otro" },
      esperado: { url: "https://zoom.us/rec/share/AAA?pwd=xyz", passcodeEmbedded: true },
    },
    {
      caso: "con passcode y sin query → ?pwd=",
      input: { shareUrl: "https://zoom.us/rec/share/AAA", playPasscode: "abc123" },
      esperado: { url: "https://zoom.us/rec/share/AAA?pwd=abc123", passcodeEmbedded: true },
    },
    {
      caso: "con passcode y query previa → &pwd=",
      input: { shareUrl: "https://zoom.us/rec/share/AAA?startTime=1", playPasscode: "a b&c" },
      esperado: {
        url: "https://zoom.us/rec/share/AAA?startTime=1&pwd=a%20b%26c",
        passcodeEmbedded: true,
      },
    },
    {
      caso: "sin passcode → share_url tal cual, no embebido",
      input: { shareUrl: "https://zoom.us/rec/share/AAA", playPasscode: null },
      esperado: { url: "https://zoom.us/rec/share/AAA", passcodeEmbedded: false },
    },
    {
      caso: "passcode vacío cuenta como ausente",
      input: { shareUrl: "https://zoom.us/rec/share/AAA", playPasscode: "" },
      esperado: { url: "https://zoom.us/rec/share/AAA", passcodeEmbedded: false },
    },
  ])("$caso", ({ input, esperado }) => {
    expect(buildPlayUrl(input)).toEqual(esperado);
  });
});

describe("extractMeetingId — número de reunión de una URL de Zoom", () => {
  it.each([
    ["https://zoom.us/j/12345678901?pwd=abc", "12345678901"],
    ["https://us02web.zoom.us/j/12345678901", "12345678901"],
    ["https://cadit.zoom.us/s/98765432101", "98765432101"],
    ["https://us06web.zoom.us/w/1112223334?tk=x&pwd=y", "1112223334"],
    ["  https://zoom.us/j/123-456-7890  ", "1234567890"],
    ["https://zoom.us/j/123%20456%207890", "1234567890"],
    ["https://zoom.us/my/academia", null],
    ["https://meet.google.com/j/12345678901", null],
    ["https://zoom.us.example.com/j/12345678901", null],
    ["https://zoom.us/rec/share/AAA", null],
    ["no es una url", null],
    ["", null],
    [null, null],
  ])("%s → %s", (url, esperado) => {
    expect(extractMeetingId(url)).toBe(esperado);
  });
});
