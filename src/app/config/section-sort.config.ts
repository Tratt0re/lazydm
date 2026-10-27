import type { DocumentFileListItemDto } from '@/dtos';

/** How the files of a section or folder page are ordered (Sort select of the toolbar), per section on this device. */
export type SectionSortMode = 'name-asc' | 'name-desc' | 'modified' | 'size' | 'type';

export const SECTION_SORT_MODES: readonly SectionSortMode[] = [
  'name-asc',
  'name-desc',
  'modified',
  'size',
  'type',
];

export const DEFAULT_SECTION_SORT: SectionSortMode = 'name-asc';

export function isSectionSortMode(value: unknown): value is SectionSortMode {
  return SECTION_SORT_MODES.some((mode) => mode === value);
}

function displayName(file: DocumentFileListItemDto): string {
  return file.title || file.name;
}

function extensionOf(file: DocumentFileListItemDto): string {
  const dot = file.path.lastIndexOf('.');
  return dot < 0 ? '' : file.path.slice(dot + 1).toLocaleLowerCase();
}

function compareNames(a: DocumentFileListItemDto, b: DocumentFileListItemDto): number {
  return (
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base', numeric: true }) ||
    a.path.localeCompare(b.path)
  );
}

/** A sorted copy of `files`; the list the page loaded is never changed. Newest and largest come first. */
export function sortSectionFiles(
  files: readonly DocumentFileListItemDto[],
  mode: SectionSortMode,
): DocumentFileListItemDto[] {
  const sorted = [...files];
  switch (mode) {
    case 'name-desc':
      return sorted.sort((a, b) => compareNames(b, a));
    case 'modified':
      return sorted.sort((a, b) => b.mtimeMs - a.mtimeMs || compareNames(a, b));
    case 'size':
      return sorted.sort((a, b) => b.size - a.size || compareNames(a, b));
    case 'type':
      return sorted.sort(
        (a, b) => extensionOf(a).localeCompare(extensionOf(b)) || compareNames(a, b),
      );
    default:
      return sorted.sort(compareNames);
  }
}

/** Sub-folders have no date or size of their own: they follow the name order, reversed for Z → A. */
export function sortSectionFolders<T extends { readonly name: string }>(
  folders: readonly T[],
  mode: SectionSortMode,
): T[] {
  const direction = mode === 'name-desc' ? -1 : 1;
  return [...folders].sort(
    (a, b) =>
      direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  );
}
