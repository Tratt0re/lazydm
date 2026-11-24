import type { DocumentFileListItemDto } from '@/dtos';

/** What narrows a section or folder page (search field and Filter menu); never remembered between visits. */
export interface SectionFilter {
  /** Typed text: matches the title, the file name and the tags. */
  readonly query: string;
  /** A file needs every one of these tags. */
  readonly tags: readonly string[];
  /** Sub-folders to keep (`''` is the main folder); empty keeps all. */
  readonly folders: readonly string[];
}

export const EMPTY_SECTION_FILTER: SectionFilter = { query: '', tags: [], folders: [] };

/** Tags shown in a row before the `+N` overflow. */
export const VISIBLE_TAGS = 3;

export function isFilterActive(filter: SectionFilter): boolean {
  return filter.query.trim() !== '' || filter.tags.length > 0 || filter.folders.length > 0;
}

/** Number of choices made in the Filter menu (the badge on its button); the search text is not counted. */
export function countMenuFilters(filter: SectionFilter): number {
  return filter.tags.length + filter.folders.length;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/** The sub-folder of a file inside `sectionPath` (`''` for the section itself). */
export function folderOfFile(file: DocumentFileListItemDto, sectionPath: string): string {
  const prefix = `${sectionPath.replace(/\/+$/, '')}/`;
  const relative = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path;
  const slash = relative.indexOf('/');
  return slash < 0 ? '' : relative.slice(0, slash);
}

/** Whether a file passes the filter. Accent- and case-insensitive; every word typed must be found. */
export function matchesSectionFilter(
  file: DocumentFileListItemDto,
  filter: SectionFilter,
  folder: string,
): boolean {
  if (filter.folders.length > 0 && !filter.folders.includes(folder)) {
    return false;
  }

  if (filter.tags.length > 0 && !filter.tags.every((tag) => file.tags.includes(tag))) {
    return false;
  }

  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }

  const haystack = fold([file.title, file.name, ...file.tags].join('\n'));
  return words.every((word) => haystack.includes(word));
}

/** A filtered copy of `files`, in the same order. */
export function filterSectionFiles(
  files: readonly DocumentFileListItemDto[],
  filter: SectionFilter,
  folderOf: (file: DocumentFileListItemDto) => string,
): DocumentFileListItemDto[] {
  return files.filter((file) => matchesSectionFilter(file, filter, folderOf(file)));
}

export interface TagOption {
  readonly tag: string;
  readonly count: number;
}

/** Every tag of the files with how many files carry it: chosen tags first, then the most used, then A → Z. */
export function collectTagOptions(
  files: readonly DocumentFileListItemDto[],
  chosen: readonly string[] = [],
): TagOption[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const tag of new Set(file.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort(
      (a, b) =>
        Number(chosen.includes(b.tag)) - Number(chosen.includes(a.tag)) ||
        b.count - a.count ||
        a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base', numeric: true }),
    );
}

export interface SplitTags {
  readonly visible: readonly string[];
  readonly hidden: readonly string[];
}

/**
 * Which tags a row shows and which go behind `+N`. Tags in the active filter come first, then those that match
 * the typed text, then the rest in their written order, so what the user is looking for is never hidden.
 */
export function splitTags(
  tags: readonly string[],
  active: readonly string[] = [],
  query = '',
  max: number = VISIBLE_TAGS,
): SplitTags {
  const needle = fold(query.trim());
  const rank = (tag: string) =>
    active.includes(tag) ? 0 : needle && fold(tag).includes(needle) ? 1 : 2;
  const ordered = tags
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => rank(a.tag) - rank(b.tag) || a.index - b.index)
    .map((item) => item.tag);
  return { visible: ordered.slice(0, max), hidden: ordered.slice(max) };
}
