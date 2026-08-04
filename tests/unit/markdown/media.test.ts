import { describe, expect, it } from 'vitest';
import {
  isOptimisableUrl,
  isVideoUrl,
  mediaSnippet,
  posterFromTitle,
  youtubeEmbedUrl,
  youtubeId,
} from '@/lib/markdown/media';

describe('isVideoUrl', () => {
  it('recognises the extensions the motion reel uploads', () => {
    expect(isVideoUrl('https://cdn.test/videos/a.mp4')).toBe(true);
    expect(isVideoUrl('https://cdn.test/videos/a.webm')).toBe(true);
    expect(isVideoUrl('https://cdn.test/videos/a.MOV')).toBe(true);
  });

  it('ignores a query string when reading the extension', () => {
    expect(isVideoUrl('https://cdn.test/videos/a.mp4?v=2')).toBe(true);
  });

  it('does not mistake an image for a video', () => {
    expect(isVideoUrl('https://cdn.test/photos/a.webp')).toBe(false);
    // The word appearing in the path is not the extension.
    expect(isVideoUrl('https://cdn.test/mp4/a.webp')).toBe(false);
  });
});

describe('youtubeId', () => {
  it('reads every link shape YouTube hands out', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(youtubeId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('refuses a host that merely mentions youtube', () => {
    // Otherwise a link in a post could point the iframe at an arbitrary origin.
    expect(youtubeId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('refuses anything that is not a single video', () => {
    expect(youtubeId('https://www.youtube.com/@someone')).toBeNull();
    expect(youtubeId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('not a url')).toBeNull();
  });

  it('builds a no-cookie embed URL', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});

describe('isOptimisableUrl', () => {
  it('allows our own bucket', () => {
    expect(isOptimisableUrl('https://cdn.test/journal/a.webp', 'cdn.test')).toBe(true);
  });

  it('refuses any other host', () => {
    // next/image throws rather than degrades on an unconfigured host, so a
    // false here is what keeps a pasted image from taking down the page.
    expect(isOptimisableUrl('https://picsum.photos/seed/n/1200/800', 'cdn.test')).toBe(false);
    expect(isOptimisableUrl('https://cdn.test.evil.example/a.webp', 'cdn.test')).toBe(false);
  });

  it('allows a same-origin relative URL but not a protocol-relative one', () => {
    expect(isOptimisableUrl('/local/a.webp', 'cdn.test')).toBe(true);
    expect(isOptimisableUrl('//elsewhere.test/a.webp', 'cdn.test')).toBe(false);
  });

  it('refuses everything when no host is configured', () => {
    // R2_PUBLIC_BASE_URL unset — remotePatterns is empty, so nothing is allowed.
    expect(isOptimisableUrl('https://cdn.test/journal/a.webp', '')).toBe(false);
  });

  it('refuses a string that is not a URL', () => {
    expect(isOptimisableUrl('not a url', 'cdn.test')).toBe(false);
  });
});

describe('posterFromTitle', () => {
  it('reads the poster out of a video title', () => {
    expect(posterFromTitle('poster:https://cdn.test/posters/a.webp')).toBe(
      'https://cdn.test/posters/a.webp',
    );
  });

  it('returns null when there is no title or no poster in it', () => {
    expect(posterFromTitle(undefined)).toBeNull();
    expect(posterFromTitle(null)).toBeNull();
    expect(posterFromTitle('')).toBeNull();
    expect(posterFromTitle('just a caption')).toBeNull();
    expect(posterFromTitle('poster:')).toBeNull();
  });
});

describe('mediaSnippet', () => {
  it('writes an image with its caption as alt text', () => {
    expect(mediaSnippet({ kind: 'image', url: 'https://cdn.test/journal/a.webp', caption: 'Oslo' })).toBe(
      '![Oslo](https://cdn.test/journal/a.webp)',
    );
  });

  it('writes an image with no caption rather than omitting the brackets', () => {
    expect(mediaSnippet({ kind: 'image', url: 'https://cdn.test/journal/a.webp' })).toBe(
      '![](https://cdn.test/journal/a.webp)',
    );
  });

  it('carries a video poster in the title', () => {
    expect(
      mediaSnippet({
        kind: 'video',
        url: 'https://cdn.test/videos/a.mp4',
        caption: 'Rooftop',
        poster: 'https://cdn.test/posters/a.webp',
      }),
    ).toBe('![Rooftop](https://cdn.test/videos/a.mp4 "poster:https://cdn.test/posters/a.webp")');
  });

  it('omits the title when a video has no poster', () => {
    expect(mediaSnippet({ kind: 'video', url: 'https://cdn.test/videos/a.mp4' })).toBe(
      '![](https://cdn.test/videos/a.mp4)',
    );
  });

  it('writes a YouTube link bare, since a lone link is what marks an embed', () => {
    expect(mediaSnippet({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'ignored' })).toBe(
      'https://youtu.be/dQw4w9WgXcQ',
    );
  });

  it('escapes a caption so it cannot break out of the image syntax', () => {
    const snippet = mediaSnippet({
      kind: 'image',
      url: 'https://cdn.test/journal/a.webp',
      caption: 'a ] b [ c',
    });
    expect(snippet).toBe('![a \\] b \\[ c](https://cdn.test/journal/a.webp)');
  });

  it('flattens newlines in a caption, which alt text cannot carry', () => {
    expect(mediaSnippet({ kind: 'image', url: 'x.webp', caption: 'one\ntwo' })).toBe('![one two](x.webp)');
  });

  it('percent-escapes a URL so a space or paren cannot end the target early', () => {
    expect(mediaSnippet({ kind: 'image', url: 'https://cdn.test/a b(1).webp' })).toBe(
      '![](https://cdn.test/a%20b%281%29.webp)',
    );
  });
});
