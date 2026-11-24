/** How the files of a section or folder page are shown (Views switch of the toolbar), per section on this device. */
export type SectionView = 'list' | 'cards' | 'graph';

export const SECTION_VIEWS: readonly SectionView[] = ['list', 'cards', 'graph'];

export const DEFAULT_SECTION_VIEW: SectionView = 'list';

export function isSectionView(value: unknown): value is SectionView {
  return SECTION_VIEWS.some((view) => view === value);
}

/**
 * The views a section offers. The graph draws the links between notes, so it is left out of the sections
 * that hold other files (Assets, Encounters, Maps): there it would be empty.
 */
export function viewsForSection(hasNotes: boolean): readonly SectionView[] {
  return hasNotes ? SECTION_VIEWS : SECTION_VIEWS.filter((view) => view !== 'graph');
}

/** The view to show: the remembered one, or the list when the section does not offer it. */
export function resolveSectionView(
  remembered: SectionView,
  available: readonly SectionView[],
): SectionView {
  return available.includes(remembered) ? remembered : DEFAULT_SECTION_VIEW;
}
