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

On macOS, regenerate all committed app icons:

```sh
npm run icons:mac
# Example with custom colors:
npm run icons:mac -- --hat '#6D5A3E' --mustache '#B9A27A'
# Dark background needs an explicit outline:
npm run icons:mac -- --background '#101114' --outline '#F0ECE3'
```

Each color accepts `#RRGGBB`. The background defaults to `#E9EAE7` (the app's light background), the moustache to `#6D5A3E` (the light theme's primary) and the outline
defaults to `none`. App icons are fixed artwork and do not follow the OS theme.
The command writes `APP_ICON.png`, `lazydm_ico_1024.png` (macOS margin and shadow),
`lazydm_ico_win.png` (Windows/Linux), `lazydm_ico_short.png` (favicon), and
`build/icon.icns`. `APP_ICON.png` is generated; make geometry edits in `Franco.svg`.

The artwork also carries four corner brackets in the moustache colour, the ones of the campaign cards and the setup panel
(`make-franco-artwork.swift`: `bracketInset`, `bracketArm`, `bracketWidth`). They sit inside the curve of the rounded icon
shape, so they follow `--mustache` and need no option of their own.

The Swift renderer needs no extra dependencies. It supports the absolute M/L/Z
polygon paths used by Franco and rejects unsupported path commands. If the SVG
geometry changes, update the matching paths in `franco.icon.ts` as well.
