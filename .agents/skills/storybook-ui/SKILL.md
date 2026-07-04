# Skill: storybook-ui

Use this skill when styling or reviewing the DevTools panel UI in this repo. The panel uses vanilla JS + Shadow DOM — no React or Emotion.

Full design system reference: `/Users/m/projects/storybook/DESIGN_SYSTEM_REPORT.md`

---

## Architecture

The DevTools dock lives in `<vite-devtools-dock-embedded>` — a custom element with a **Shadow DOM**. Style isolation means all CSS must be injected into the shadow root.

```js
const dock = document.querySelector('vite-devtools-dock-embedded');
const shadow = dock.shadowRoot;
```

---

## CSS Custom Properties Block

Inject this at the shadow root. These values come from Storybook's codebase (`code/core/src/theming/`).

```js
function getSbTokenStyles() {
  return `
    :host {
      /* Brand */
      --sb-color-brand: #FF4785;
      --sb-color-secondary: #006DEB;

      /* Foreground */
      --sb-fgcolor-default: #2E3338;
      --sb-fgcolor-muted: #5C6570;
      --sb-fgcolor-accent: #006DEB;
      --sb-fgcolor-inverse: #FFFFFF;
      --sb-fgcolor-positive: #427C27;
      --sb-fgcolor-warning: #7A4100;
      --sb-fgcolor-negative: #C23400;

      /* Background */
      --sb-bgcolor-app: #F6F9FC;
      --sb-bgcolor-default: #FFFFFF;
      --sb-bgcolor-muted: #F6F9FC;
      --sb-bgcolor-hover: #DBECFF;
      --sb-bgcolor-positive: #F1FFEB;
      --sb-bgcolor-warning: #FFF7EB;
      --sb-bgcolor-negative: #FFF0EB;
      --sb-bgcolor-critical: #D13800;

      /* Border */
      --sb-bordercolor-default: hsl(212 50% 30% / 0.15);
      --sb-bordercolor-muted: hsl(0 0% 0% / 0.1);
      --sb-bordercolor-positive: #BFE7AC;
      --sb-bordercolor-warning: #FFCE85;
      --sb-bordercolor-negative: #FFC3AD;

      /* Toolbar chrome */
      --sb-bar-text: #5C6570;
      --sb-bar-hover: #005CC7;
      --sb-bar-selected: #0063D6;
      --sb-bar-bg: #FFFFFF;

      /* Typography */
      --sb-font-sans: "Nunito Sans", -apple-system, ".SFNSText-Regular", "San Francisco", BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      --sb-font-mono: ui-monospace, Menlo, Monaco, "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Droid Sans Mono", "Courier New", monospace;
      --sb-font-size-s1: 12px;
      --sb-font-size-s2: 14px;
      --sb-font-size-s3: 16px;
      --sb-font-size-m1: 20px;
      --sb-font-weight-regular: 400;
      --sb-font-weight-bold: 700;

      /* Sidebar icon colors */
      --sb-icon-document: #FF9D0A;
      --sb-icon-directory: #874ABF;
      --sb-icon-component: #0A7CFF;
      --sb-icon-story: #4ABFBD;

      /* Misc */
      --sb-border-radius: 4px;

      /* Syntax / prop type badge colors (matches Storybook's object inspector) */
      --sb-syntax-string: rgb(196, 26, 22);
      --sb-syntax-number: rgb(28, 0, 207);
      --sb-syntax-boolean: rgb(28, 0, 207);
      --sb-syntax-function: rgb(13, 34, 170);
      --sb-syntax-key: rgb(136, 19, 145);
      --sb-syntax-null: rgb(128, 128, 128);
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --sb-color-secondary: #479DFF;

        --sb-fgcolor-default: #C9CCCF;
        --sb-fgcolor-muted: #95999D;
        --sb-fgcolor-accent: #479DFF;
        --sb-fgcolor-inverse: #1B1C1D;
        --sb-fgcolor-positive: #86CE64;
        --sb-fgcolor-warning: #FFAD33;
        --sb-fgcolor-negative: #FF6933;

        --sb-bgcolor-app: #1B1C1D;
        --sb-bgcolor-default: #222325;
        --sb-bgcolor-muted: #1B1C1D;
        --sb-bgcolor-hover: #233952;
        --sb-bgcolor-positive: transparent;
        --sb-bgcolor-warning: transparent;
        --sb-bgcolor-negative: transparent;

        --sb-bordercolor-default: hsl(0 0% 100% / 0.1);
        --sb-bordercolor-muted: hsl(0 0% 100% / 0.05);
        --sb-bordercolor-positive: hsl(101 52% 64% / 0.15);
        --sb-bordercolor-warning: hsl(36 100% 64% / 0.15);
        --sb-bordercolor-negative: hsl(16 100% 64% / 0.15);

        --sb-bar-text: #95999D;
        --sb-bar-hover: #70B3FF;
        --sb-bar-selected: #479DFF;
        --sb-bar-bg: #222325;

        --sb-syntax-string: rgb(233, 63, 59);
        --sb-syntax-number: hsl(252, 100%, 75%);
        --sb-syntax-boolean: hsl(252, 100%, 75%);
        --sb-syntax-function: rgb(85, 106, 242);
        --sb-syntax-key: rgb(227, 110, 236);
        --sb-syntax-null: rgb(127, 127, 127);
      }
    }
  `;
}
```

### Inject at initialization

```js
function injectDesignTokens(shadowRoot) {
  const style = document.createElement('style');
  style.id = 'sb-design-tokens';
  style.textContent = getSbTokenStyles();
  shadowRoot.prepend(style);
}
```

---

## Style contexts

There are three distinct places where styles get applied. Use the right injection approach for each:

| Context | File(s) | Where tokens go | Notes |
|---|---|---|---|
| **Shadow DOM** (context menu, dock chrome) | `src/client/context-menu.ts` | `:host {}` CSS vars at top of embedded style string | Tokens + dark mode override both in the string |
| **Panel iframe** | `src/panel/panel.css` | `:root {}` CSS vars at top of the file | Standalone HTML document, `:root` not `:host` |
| **Host page overlays** | `overlay.ts`, `coverage-actions.ts`, `interaction-recorder.ts` | Hardcoded hex in `style.cssText` strings | CSS variables **cannot** be consumed here — the element is injected into the user's page DOM, not a shadow root. Use the token hex values directly and add a comment like `/* --sb-color-brand */`. |

---

## Usage in component CSS

Once injected, use the variables throughout the shadow DOM's stylesheets:

```css
.dock-button {
  color: var(--sb-fgcolor-default);
  background: var(--sb-bgcolor-default);
  border: 1px solid var(--sb-bordercolor-default);
  border-radius: var(--sb-border-radius);
  font-family: var(--sb-font-sans);
  font-size: var(--sb-font-size-s2);
}

.dock-button:hover {
  background: var(--sb-bgcolor-hover);
  color: var(--sb-bar-hover);
}

.dock-button.selected {
  color: var(--sb-bar-selected);
}

.status-positive {
  color: var(--sb-fgcolor-positive);
  background: var(--sb-bgcolor-positive);
  border-color: var(--sb-bordercolor-positive);
}
```

---

## Review checklist

When reviewing UI changes to the panel:

- [ ] No hardcoded hex colors — all colors use `var(--sb-*)`
- [ ] Light mode variables set in `:host {}`
- [ ] Dark mode overrides in `@media (prefers-color-scheme: dark) { :host {} }`
- [ ] No new React/Emotion dependencies added
- [ ] Styles injected via `shadowRoot.prepend(style)` or equivalent
- [ ] Interactive elements have ARIA labels

---

## Scaffold new UI element

When adding a new UI element to the dock panel:

1. Define styles using `--sb-*` variables
2. Inject via the `getSbTokenStyles()` pattern or extend the existing style block
3. For complex React-based panel content (iframe panels), you may use React — the constraint is on the dock/overlay layer only
4. Reference `DESIGN_SYSTEM_REPORT.md` for the full Storybook component catalog if the iframe panels will use React

---

## What NOT to do

- Don't use `document.body` styles — scope everything to the shadow root
- Don't add `@storybook/theming` or `@emotion/styled` as dependencies for the dock layer
- Don't hardcode light-only colors — always pair with dark mode overrides
- Don't use Figma's `--bgcolor/default` slash format — use `--sb-bgcolor-default` (dashes)
