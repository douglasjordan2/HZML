# State Iteration

Ideas for extending the Dispatcher/Dispatched system and HZML's client-side state coverage.

## Current coverage

| Tier | Mechanism | Covers |
|------|-----------|--------|
| 1 | Toggled/Toggler (checkbox/radio + CSS `:has()`) | Boolean/enum: drawers, modals, tabs, accordions, dropdowns |
| 2 | Dispatcher/Dispatched (transform + noop iframe) | Computed values: counters, ratings, pagination, bounded inputs |
| 3 | `hzml.on()` manual handler | Cross-channel logic, custom DOM updates, side effects |
| 4 | Raw `<script>` | Timers, drag-and-drop, canvas, third-party libs |

## Dispatched render callback

The auto-generated `_up` function only updates `textContent` or input `.value`. Some patterns need to update classes, attributes, or styles based on the dispatched value.

A `render` callback on Dispatched would give per-element control over how values are displayed:

```html
<${Dispatched} by="rating" tag="div" value="3"
  render=${(el, v) => {
    el.querySelectorAll('span').forEach((s, i) =>
      s.classList.toggle('text-yellow-400', i < v)
    )
  }}
/>
```

The framework would call `render(element, value)` instead of the default `textContent` assignment when a render callback is registered.

## Cross-channel dependencies

`total = qty * price` requires reading from two channels. Dispatcher/Dispatched is single-channel by design. Options:

**Compound dispatch** — one anchor dispatches to multiple channels via `#qty=3&price=10`. The noop parser already handles `&`-separated pairs. A Dispatcher could accept multiple `to` targets:

```html
<${Dispatcher} to=${{ qty: v => +v + 1, price: v => v }}>Add one<//>
```

**Derived channels** — a new primitive that reads from multiple Dispatched elements and computes a value. Runs after any upstream channel updates:

```html
<${Derived} from=${["qty", "price"]} as="total"
  compute=${(qty, price) => qty * price}
/>
<${Dispatched} by="total" tag="span" />
```

## Toggle + Dispatch bridge

Some patterns need both: "show error message when qty exceeds max." Currently Toggle and Dispatch are independent systems.

A bridge would let a Dispatcher's value drive a Toggle's checked state:

```html
<${Dispatched} by="qty" toggle="qty-warning"
  when=${v => v > 10}
/>
<${Toggled} id="qty-warning" ontrue="block text-red-500" onfalse="hidden">
  Maximum 10 items
<//>
```

When the dispatch value satisfies `when`, the linked Toggle gets checked. This keeps both systems doing what they're good at: Dispatch owns the value, Toggle owns the visibility.

## Time-based dispatch

Countdowns, auto-advance carousels, debounced search. Dispatcher needs a click to trigger — no way to auto-dispatch on an interval without `<script>`.

A `tick` prop on Dispatched could auto-dispatch at an interval:

```html
<${Dispatched} by="countdown" tag="span" value="60" tick="1000" />
<${Dispatcher} to="countdown" transform=${v => v - 1} />
```

The framework emits a `setInterval` that calls the channel's update function. The Dispatcher's transform still defines what happens per tick. `tick` is milliseconds.

## List/selection state

Toggler with radio buttons handles "which one" for a fixed set. For dynamic lists (search results, filterable options), the pattern works but is verbose. A selection-aware variant of Dispatched could simplify:

```html
<${Dispatcher} to="selected" transform=${() => item.id}>
  ${item.name}
<//>
```

This is already supported — `transform` can return any value, including strings. The gap is styling the selected item. Currently you'd need Toggle for that, or a render callback on Dispatched to toggle a class on the matching item.

## Validation feedback

Form fields often need client-side validation feedback before submission. This bridges Dispatch (value tracking) and Toggle (visibility):

Could be composed from existing primitives:
- Dispatched tracks the value
- A manual `hzml.on()` handler checks constraints and toggles error visibility
- Or the Toggle+Dispatch bridge above handles it declaratively
