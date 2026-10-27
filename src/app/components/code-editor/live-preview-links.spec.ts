import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import type { DocumentLinkDto } from '@/dtos';

import { livePreview, setLivePreviewContext } from './live-preview';

const goblin: DocumentLinkDto = {
  raw: 'goblin',
  kind: 'wikilink',
  targetName: 'goblin',
  heading: null,
  resolvedPath: 'camp/npcs/goblin.md',
};

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

/** An editor with the note's text and the cursor away from the block, as when a note is opened. */
function open(block: string): EditorView {
  const doc = `${block}\n\nafter the block`;
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown({ base: markdownLanguage }), livePreview()],
    }),
  });
  return view;
}

function resolveLinks(editor: EditorView, links: readonly DocumentLinkDto[]): void {
  editor.dispatch({ effects: setLivePreviewContext.of({ links, sourcePath: 'camp/scene.md' }) });
}

describe('links in quotes and callouts', () => {
  it('draws a link of a plain quote as a link', () => {
    const editor = open('> see [[goblin]]');
    resolveLinks(editor, [goblin]);

    expect(editor.contentDOM.querySelector('.cm-lp-quote a[data-route]')).not.toBeNull();
  });

  it('draws a link of a callout as a link once the note links arrive after the text', () => {
    const editor = open('> [!info] Title\n> see [[goblin]]');
    resolveLinks(editor, []);
    expect(editor.contentDOM.querySelector('.arc-callout a[data-route]')).toBeNull();

    resolveLinks(editor, [goblin]);
    expect(editor.contentDOM.querySelector('.arc-callout a[data-route]')).not.toBeNull();
    expect(editor.contentDOM.querySelector('.arc-callout [data-broken-raw]')).toBeNull();
  });

  it('draws a link of a callout without space after the quote mark', () => {
    const editor = open('>[!info] Title\n>see [[goblin]]');
    resolveLinks(editor, [goblin]);

    expect(editor.contentDOM.querySelector('.arc-callout a[data-route]')).not.toBeNull();
  });

  it('draws a link of a table as a link once the note links arrive after the text', () => {
    const editor = open('| Name |\n| --- |\n| [[goblin]] |');
    resolveLinks(editor, []);
    expect(editor.contentDOM.querySelector('.cm-lp-table a[data-route]')).toBeNull();

    resolveLinks(editor, [goblin]);
    expect(editor.contentDOM.querySelector('.cm-lp-table a[data-route]')).not.toBeNull();
  });
});
