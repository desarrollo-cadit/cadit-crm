import { describe, expect, it } from "vitest";
import { fullName } from "@/lib/utils";

describe("fullName (005 iteración 6 — split de contact.name)", () => {
  it("con lastName: concatena firstName + lastName", () => {
    expect(fullName({ firstName: "Diego", lastName: "Pérez" })).toBe("Diego Pérez");
  });

  it("sin lastName (null): devuelve solo firstName", () => {
    expect(fullName({ firstName: "Diego", lastName: null })).toBe("Diego");
  });

  it("sin lastName (undefined): devuelve solo firstName", () => {
    expect(fullName({ firstName: "Diego" })).toBe("Diego");
  });
});
