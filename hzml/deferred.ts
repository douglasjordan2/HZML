const DEFERRED_BRAND = Symbol.for("hzml.deferred")

let nextId = 0

export class Deferred<T = unknown> {
  readonly [DEFERRED_BRAND] = true
  readonly id: number
  readonly promise: Promise<T>

  constructor(promise: Promise<T>) {
    this.id = nextId++
    this.promise = promise
  }
}

export function isDeferred(value: unknown): value is Deferred {
  return value !== null && typeof value === "object" && DEFERRED_BRAND in value
}
