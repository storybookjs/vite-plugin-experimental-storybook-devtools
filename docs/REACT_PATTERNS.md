# React Authoring Patterns — Support Matrix

What the component detector recognizes, why, and the documented limits.

Detection is non-intrusive: a Babel pass tags exported component **bindings**
with a metadata symbol (`__chRegisterMeta`), and the runtime reads that symbol
off the live React fiber tree. So a pattern is "supported" iff the transform
can find a **stable, exported, statically-named binding** to tag.

Every pattern below is exercised live in
`playground/react/src/components/patterns/` (rendered by `PatternShowcase`,
shared with the React 18 playground via symlink) and asserted by
`e2e/playground-react*-detection.spec.ts`.

## ✅ Supported

| Pattern | Example | Component file |
|---|---|---|
| Named function export | `export function Badge() {}` | `Badge.tsx` |
| Named arrow/const export | `export const App = () => {}` | `App.tsx` |
| Default export — function declaration | `export default function DefaultBanner() {}` | `patterns/DefaultBanner.tsx` |
| Default export — via identifier | `const IconChip = () => {}; export default IconChip` | `patterns/IconChip.tsx` |
| `export { X }` specifier | `function X(){}; export { X }` | (transform unit tests) |
| `memo(...)` (bare) | `export const MemoStat = memo(fn)` | `patterns/MemoStat.tsx` |
| `forwardRef(...)` (bare) | `export const FancyField = forwardRef(fn)` | `patterns/FancyField.tsx` |
| `React.memo(...)` / `React.forwardRef(...)` (member form) | `export const ReactMemoCard = React.memo(fn)` | `patterns/ReactMemoCard.tsx` |
| Composed wrappers | `export const MemoForwardInput = memo(forwardRef(fn))` | `patterns/MemoForwardInput.tsx` |
| Class component | `export class LegacyCounter extends React.Component` | `patterns/LegacyCounter.tsx` |
| Generic component | `export function GenericList<T>(p: Props<T>)` | `patterns/GenericList.tsx` |
| Compound component (parent) | `export function Disclosure() {}` | `patterns/Disclosure.tsx` |
| Barrel re-export | `export { MemoStat } from './MemoStat'` | `patterns/index.ts` |
| Multiple exported components per file | (transform unit tests) | — |

### Supported prop kinds (`patterns/PropZoo.tsx`)

primitives · string-literal unions · destructured defaults · deep nested
objects · arrays of objects · **arrays of primitives** · **`Date`** ·
**inline `style` object** · **element prop that isn't `children`** ·
**function-as-children / render prop** · **discriminated unions** ·
**nullable** (`string | null`) · **tuple** (`[number, number]`) ·
**event handler with args** · `ReactNode` children (single / array /
**nested mapped array**) · function props · **`Date`** (emitted as
`new Date("…ISO…")`).

**Prop serialization safety:** React-reserved props `ref` and `key` are
dropped (never valid story args — and a live `ref` holds a DOM node).
DOM nodes / `Window` / circular or very deep structures are replaced with
safe markers, so a `forwardRef`'s `ref` can never blow the call stack
("Maximum call stack size exceeded").

## ⚠️ Supported with a nuance

| Pattern | Nuance |
|---|---|
| Compound `Parent.Sub = Sub` | The exported **parent** is detected; dot-notation subcomponents assigned as static members (`Disclosure.Summary`, `Disclosure.Panel`) are **not** separate bindings, so they are not detected individually. |
| Component returning `null` | Registered with no anchor element until it renders DOM (e.g. `Modal` when closed) — present in the registry, just not hoverable. |
| `memo(forwardRef(...))` | React creates two tagged fibers (Memo wrapper + ForwardRef inner). The walker collapses a same-`sourceId` wrapper chain into **one** selectable instance anchored to the real DOM, so it registers once and story creation works (`MemoForwardInput`). Genuine recursion (`<Tree>` inside `<Tree>`) is unaffected — a host element between instances resets the chain. |

## ❌ Unsupported (documented limitations)

| Pattern | Why | Workaround |
|---|---|---|
| Anonymous default export — `export default () => {}` / `export default function(){}` | No stable binding name to tag. | Name it: `function Foo(){}; export default Foo`. (`patterns/AnonWidget.tsx`) |
| Arbitrary custom HOC — `export const X = withThing(Y)` | A call expression is not provably a component at build time (only `memo`/`forwardRef` are special-cased). | Export the inner component and use it directly, or wrap with `memo`/`forwardRef`. If the inner component is itself exported/tagged it is detected under **its** name. (`patterns/FramedNote.tsx` + `withFrame.tsx`) |
| HOC factory default — `export default connect()(X)` | Same as above (call result). | Assign to a named binding first. |
| Non-exported / local components | Only exported components can have stories, so detection is intentionally export-scoped. | Export it if you want a story. |
| Non-PascalCase functions | Not treated as components by design. | — |
| Object-of-components — `export const Icons = { Star: () => … }` | Not a function/class binding. | Export each as its own named component. |
| Server Components (RSC) | The DevTools hook runs only on the client; server components never reach it. | Client components are detected normally; this is expected, not a bug. |

## How to extend support

The recognizer lives in `src/frameworks/react/transform.ts`
(`isComponentInit` / `isMemoOrForwardRef` / `considerFunction` /
`considerClass`). The runtime tag/lookup is `__chRegisterMeta` / `readMeta`
in `src/frameworks/react/runtime-module.ts`. Any new pattern must keep the
"non-intrusive" invariant (tag a binding; never wrap the component) and add a
demonstrator under `patterns/` plus a detection-spec assertion.
