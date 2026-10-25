export const IMAGE_WIDTHS = ['half', 'wide', 'full'] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** How an embedded image sits in the note; null width = the image's natural size. */
export interface ImageFrame {
  readonly width: ImageWidth | null;
}

export const NO_IMAGE_FRAME: ImageFrame = { width: null };

export interface ParsedImageEmbed {
  readonly path: string;
  readonly frame: ImageFrame;
  /** The alias text that is not a width word (what the embed is called), if any. */
  readonly label: string | null;
}

/**
 * Splits the inside of an `![[…]]` embed: `path|label|wide`. The width is the alias part that is a width
 * word; the rest of the alias stays the label.
 */
export function parseImageEmbed(raw: string): ParsedImageEmbed {
  const [path, ...aliasParts] = raw.split('|');
  let width: ImageWidth | null = null;
  const labelParts: string[] = [];
  for (const part of aliasParts) {
    const token = part.trim().toLowerCase();
    if ((IMAGE_WIDTHS as readonly string[]).includes(token)) {
      width = token as ImageWidth;
    } else {
      labelParts.push(part);
    }
  }

  return { path, frame: { width }, label: labelParts.length ? labelParts.join('|') : null };
}

/** The same embed with another frame: path, label, then the width when set. */
export function withImageFrame(raw: string, frame: ImageFrame): string {
  const { path, label } = parseImageEmbed(raw);
  return [path, label, frame.width].filter((part): part is string => !!part).join('|');
}
