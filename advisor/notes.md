# Known problems, one per build

The advisor reads this file as part of its grounding. Each entry names a problem a team would hit with that library on this screen, and the fix the build used. The entries come from the build READMEs and `handoff.md`. No figure here is new: any size or time quoted also appears in `results/` or `write-up/README.md`, and `api/_lib/notes.test.ts` fails if one does not.

## react-shadcn (shadcn/ui)

Radix `Dialog` returns focus only to a `Dialog.Trigger`. A dialog opened from a table row through controlled `open` state sends focus to `<body>` on close. Fix: keep a ref to the row that opened it and focus that ref in `onCloseAutoFocus`. Radix `Select` is single value only, so a multi-select has to be assembled from `DropdownMenu` and `Checkbox`.

## react-mui (Material UI)

`Snackbar` shows one message at a time, so a capped stack of toasts is application code. Fix: keep the stack in your own state and render each entry as an `Alert` inside a live region you mount yourself. `ButtonBase` focus styling only changes opacity, so add an explicit `:focus-visible` outline. With `displayEmpty` on a `Select`, the `InputLabel` prints over the placeholder unless it gets `shrink`.

## react-chakra (Chakra UI)

The toast store's `max` option queues new toasts past the limit instead of dropping the oldest. Fix: track the open toast ids and call `toaster.remove()` on the oldest before adding one past the cap. The `Field.Root` and `Fieldset.Root` recipes set `width: 100%`, so fields in a flex row wrap one per line until each gets an explicit `flex` and `width="auto"`.

## react-antd (Ant Design)

`Table` pulls in `rc-virtual-list` whether or not the table virtualizes, and that alone costs roughly 247 KB gzipped with React, which is what puts this build over the 180 KB budget. Trimming elsewhere (a native `<input type="date">` in place of `DatePicker`, plain markup in place of `Result` and `Skeleton`) does not close the gap. `Form.Item` shows a validation error without wiring `aria-invalid` or `aria-describedby`, so add both by hand. With the record modal open, `.ant-modal-root` makes the page scroll sideways a little; no CSS fix worked, so it is recorded as a library quirk.

## react-headless (Headless UI)

There is no table, pagination or toast primitive, so all three are application code, along with their `aria-sort`, caption and live regions. Fix: build them against the accessibility requirements from the start. With two stacked dialogs, the one underneath is correctly marked `aria-hidden`, so tests that query it need `{ hidden: true }`.

## vue-vuetify (Vuetify)

`vite-plugin-vuetify` auto-imports component styles but not the base stylesheet. Without `import 'vuetify/styles'` in `main.ts`, outlined fields render broken. Fix: import it, and use the `mdi-svg` icon set so no icon font is needed. Adding the stylesheet is why the measured delta rose to 128.87 KB. A `v-btn` forces uppercase text, so a sortable header built from one needs a scoped rule to undo it.

## vue-primevue (PrimeVue)

PrimeVue follows the system dark mode by default (`darkModeSelector: 'system'`), so on a machine with a dark preference its themed controls turn dark while your own light styles stay put, and text contrast breaks. Fix: pass `options: { darkModeSelector: false }` with the theme preset. The default Aura preset carries tokens for every component; the build only fit the budget after trimming the preset to the components it mounts and dropping an unused `primeicons` font import. `Toast` has no persistent live region, no stack cap and no Escape dismissal, so the toast stack is hand built.

## vue-quasar (Quasar)

Without the Material Icons font, every `QSelect` prints the ligature name `arrow_drop_down` as text. Fix: pass the caret icon as an SVG path string, which `QIcon` renders inline with no font. `QInput` renders its own `<label>`, so wrapping it in another `<label>` is an axe violation; use its `label` prop instead. `persistent` on `QDialog` also suppresses its `escape-key` event, so listen for `keydown` on the dialog content. The pagination row needs `flex-wrap: wrap` to fit a narrow screen.
