import type { ReactNode } from 'react';
import {
  isSafeHref,
  type InlineNode,
  type ListItemNode,
  type RichBlockNode,
  type RichText as RichTextDoc,
} from '@/lib/post/content';

/**
 * Renders stored rich text. Every element is built here from a known node type,
 * so there is nothing to sanitise — an unknown node never reaches this far, and
 * a link whose target is not http(s), mailto or on-site is dropped to its text
 * even if one somehow did.
 */
export function RichText({ doc }: { doc: RichTextDoc }) {
  return <>{doc.content.map((node, index) => block(node, index))}</>;
}

function block(node: RichBlockNode | ListItemNode, key: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
      // An empty paragraph is a blank line the writer left; a <p> with nothing
      // in it would still take a full ruled line of space.
      return node.content?.length ? <p key={key}>{inlines(node.content)}</p> : null;
    case 'bulletList':
      return <ul key={key}>{node.content.map(block)}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={node.attrs?.start}>
          {node.content.map(block)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{node.content.map(block)}</li>;
  }
}

function inlines(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'hardBreak') return <br key={index} />;

    let out: ReactNode = node.text;
    // Innermost first, so a bold link renders <a><strong>…</strong></a> and the
    // underline runs under the whole of it.
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') out = <strong>{out}</strong>;
      else if (mark.type === 'italic') out = <em>{out}</em>;
    }
    const link = node.marks?.find((mark) => mark.type === 'link');
    if (link && link.type === 'link' && isSafeHref(link.attrs.href)) {
      out = (
        <a href={link.attrs.href} rel="noreferrer">
          {out}
        </a>
      );
    }
    return <span key={index}>{out}</span>;
  });
}
