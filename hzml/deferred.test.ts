import { describe, expect, test } from "bun:test";
import { Deferred, isDeferred } from "./deferred";

describe("isDeferred", () => {
  test("true for Deferred instances", () => {
    expect(isDeferred(new Deferred(Promise.resolve(1)))).toBe(true);
  });

  test("false for plain objects, promises, and nullish values", () => {
    expect(isDeferred({})).toBe(false);
    expect(isDeferred(Promise.resolve(1))).toBe(false);
    expect(isDeferred(null)).toBe(false);
    expect(isDeferred(undefined)).toBe(false);
    expect(isDeferred("deferred")).toBe(false);
  });

  test("brand is the shared Symbol.for key, so foreign objects can carry it", () => {
    const foreign = { [Symbol.for("hzml.deferred")]: true };
    expect(isDeferred(foreign)).toBe(true);
  });
});

describe("Deferred", () => {
  test("ids increment monotonically and the promise is exposed", () => {
    const p = Promise.resolve("v");
    const a = new Deferred(p);
    const b = new Deferred(p);
    expect(b.id).toBe(a.id + 1);
    expect(a.promise).toBe(p);
  });
});
