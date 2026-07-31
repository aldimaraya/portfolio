/**
 * Client-side completeness check for the post form — the counterpart to
 * src/lib/photo/form.ts and src/lib/video/form.ts. savePost still validates
 * server-side; this only drives the save button and its hint.
 */

export interface PostDraft {
  title: string;
  markdownContent: string;
}

export function missingRequiredFields(draft: PostDraft): string[] {
  const missing: string[] = [];

  if (!draft.title.trim()) missing.push('a title');
  if (!draft.markdownContent.trim()) missing.push('some content');

  return missing;
}
