'use client';

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useRef } from 'react';
import { isSafeHref, richTextSchema, type RichText } from '@/lib/post/content';
import { ToolButton } from './BlockToolbar';

/**
 * A paragraph-and-list text field, edited in place on the sheet.
 *
 * TipTap with everything this post format cannot hold switched off — headings
 * are their own block, and code, strike, quotes and rules have no place in it —
 * so a paste from anywhere is reduced to paragraphs, lists, bold, italic and
 * links before it reaches the document. Markdown typing shortcuts still work as
 * shortcuts (`- ` starts a list, `**` bolds), but they turn into formatting as
 * they are typed: nothing is ever stored as Markdown.
 */
export function useRichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: RichText;
  onChange: (value: RichText) => void;
  placeholder: string;
}): Editor | null {
  // Held in a ref so the editor, created once, always calls the latest handler.
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        // An empty paragraph kept after the last node, so the caret can always
        // leave a list. In a block of its own it is just a blank ruled line;
        // Enter twice leaves a list anyway.
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          // The stored schema's rule, enforced at the source too: a pasted
          // javascript: link never becomes a link at all.
          isAllowedUri: (url, context) => context.defaultValidate(url) && isSafeHref(url),
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    // The editor page is server-rendered; TipTap must not render until hydration.
    immediatelyRender: false,
    editorProps: { attributes: { class: 'prose-portfolio post-prose editor-prose' } },
    onUpdate: ({ editor: current }) => {
      const parsed = richTextSchema.safeParse(current.getJSON());
      // TipTap's schema is narrower than the stored one, so this does not fail
      // in practice; if it ever does, the last valid text is kept rather than
      // saving something the page cannot render.
      if (parsed.success) change.current(parsed.data);
      else console.warn('Rich text did not validate', parsed.error.issues[0]);
    },
  });

  // The placeholder can change after mount (a tray-made block keeps its prompt).
  useEffect(() => {
    if (!editor) return;
    const extension = editor.extensionManager.extensions.find((entry) => entry.name === 'placeholder');
    if (extension && extension.options.placeholder !== placeholder) {
      extension.options.placeholder = placeholder;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, placeholder]);

  return editor;
}

export function RichTextContent({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} />;
}

/** The formatting buttons for a rich text field, shown in its block's toolbar. */
export function RichTextTools({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      link: current?.isActive('link') ?? false,
      bullet: current?.isActive('bulletList') ?? false,
      ordered: current?.isActive('orderedList') ?? false,
    }),
  });
  if (!editor || !state) return null;

  function link() {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const typed = window.prompt('Link to where? Leave empty to remove the link.', current ?? '')?.trim();
    if (typed === undefined) return;
    if (!typed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // "example.com" means the website, not a page on this site called that.
    const href = /^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(typed) ? typed : `https://${typed}`;
    if (!isSafeHref(href)) {
      window.alert('Links can go to a web address, an email address, or a page on this site.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  return (
    <>
      <ToolButton label="Bold (⌘B)" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-semibold">B</span>
      </ToolButton>
      <ToolButton label="Italic (⌘I)" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="font-serif italic">I</span>
      </ToolButton>
      <ToolButton label="Link" active={state.link} onClick={link}>
        Link
      </ToolButton>
      <ToolButton label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </ToolButton>
    </>
  );
}
