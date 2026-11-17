# Franco and app icons

`src/assets/icon/Franco.svg` supplies the app artwork geometry. Its body and tentacles
share one outline; the hat retains its gap above the head.

Inline SVG and the Angular `franco` icon support independent CSS colors:

```html
<arc-icon arcType="franco"
  style="--franco-hat: #6D5A3E; --franco-mustache: #B9A27A" />
```

The defaults are a dark hat (`#202428`) and a moustache in the primary colour: `#6D5A3E` in the light theme, `#B9A27A` in the dark theme.
`--franco-outline` controls the theme outline. For a standalone SVG, edit the
custom properties inside its `<style>`; CSS on a parent cannot reach an SVG
loaded through `<img>`.

The app icon is the face only: Franco's eye and moustache on the dark tone of his body (`#202428`), with the dark
theme's bronze (`#B9A27A`) for the moustache. Only the `franco-eye`, `franco-pupil` and `franco-mustache` paths are drawn.
With `--full` the icon is the whole Franco on the light app background (`#E9EAE7`) with the light theme's bronze
(`#6D5A3E`), framed by the app's engraved divider (hairline with a big diamond between two small ones) along the top and
bottom edge.

On macOS, regenerate all committed app icons:

```sh
npm run icons:mac                 # the face
npm run icons:mac -- --full       # the whole Franco with the dividers
# Example with custom colors:
npm run icons:mac -- --mustache '#B9A27A' --background '#101114'
# A dark background for the full Franco needs an explicit outline:
npm run icons:mac -- --full --background '#101114' --outline '#F0ECE3'
```

Each color accepts `#RRGGBB`. `--background` and `--mustache` default as above for the chosen mode; `--hat` defaults to
`#202428` (only the full Franco shows it) and the outline to `none`. App icons are fixed artwork and do not follow the OS
theme. The command writes `APP_ICON.png`, `lazydm_ico_1024.png` (macOS margin and shadow),
`lazydm_ico_win.png` (Windows/Linux), `lazydm_ico_short.png` (favicon), and
`build/icon.icns`. `APP_ICON.png` is generated; make geometry edits in `Franco.svg`.

The Swift renderer needs no extra dependencies. It supports the absolute M/L/Z
polygon paths used by Franco and rejects unsupported path commands. If the SVG
geometry changes, update the matching paths in `franco.icon.ts` as well.
