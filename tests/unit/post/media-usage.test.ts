import { describe, it, expect } from 'vitest';
import { mediaUrlForms, postsEmbedding, mediaInUseMessage } from '@/lib/post/media-usage';
import { mediaSnippet } from '@/lib/markdown/media';

const BUCKET = 'https://media.example.com';
const PHOTO = `${BUCKET}/photos/namsan.webp`;
const CLIP = `${BUCKET}/videos/tram.mp4`;
const POSTER = `${BUCKET}/videos/tram-poster.webp`;
const SPRITE = `${BUCKET}/videos/tram-sprite.webp`;

function post(title: string, markdownContent: string, draft = false) {
  return { title, markdownContent, draft };
}

describe('mediaUrlForms', () => {
  it('looks for both the stored URL and its Markdown spelling', () => {
    const url = `${BUCKET}/photos/a b (1).webp`;
    const forms = mediaUrlForms([url]);
    expect(forms).toContain(url);
    expect(forms).toContain(`${BUCKET}/photos/a%20b%20%281%29.webp`);
  });

  it('collapses the two when escaping changes nothing', () => {
    expect(mediaUrlForms([PHOTO])).toEqual([PHOTO]);
  });

  it('ignores blanks, so an empty column cannot match every post', () => {
    expect(mediaUrlForms(['', '   '])).toEqual([]);
  });
});

describe('postsEmbedding', () => {
  const posts = [
    post('A morning in Namsan', `Text\n\n${mediaSnippet({ kind: 'image', url: PHOTO })}\n`),
    post('Winter light', 'No media at all.'),
    post('Tram', mediaSnippet({ kind: 'video', url: CLIP, poster: POSTER }), true),
  ];

  it('finds the posts that name the URL', () => {
    expect(postsEmbedding(posts, [PHOTO]).map((p) => p.title)).toEqual(['A morning in Namsan']);
  });

  it('finds a clip through any of its three objects', () => {
    for (const url of [CLIP, POSTER]) {
      expect(postsEmbedding(posts, [url]).map((p) => p.title)).toEqual(['Tram']);
    }
    expect(postsEmbedding(posts, [SPRITE])).toEqual([]);
    expect(postsEmbedding(posts, [CLIP, POSTER, SPRITE]).map((p) => p.title)).toEqual(['Tram']);
  });

  it('returns drafts alongside published entries', () => {
    expect(postsEmbedding(posts, [PHOTO, CLIP]).map((p) => p.title)).toEqual([
      'A morning in Namsan',
      'Tram',
    ]);
  });

  it('reports each post once however many times it embeds the media', () => {
    const twice = [post('Twice', `${PHOTO}\n\n${PHOTO}`)];
    expect(postsEmbedding(twice, [PHOTO])).toHaveLength(1);
  });

  // A key with a space is stored percent-escaped, so a raw-string search misses.
  it('matches media whose URL had to be escaped on the way in', () => {
    const url = `${BUCKET}/photos/a b.webp`;
    const body = [post('Spaced', mediaSnippet({ kind: 'image', url }))];
    expect(postsEmbedding(body, [url])).toHaveLength(1);
  });

  it('matches a URL written as a plain link rather than an embed', () => {
    const body = [post('Linked', `See [the frame](${PHOTO}) for the full size.`)];
    expect(postsEmbedding(body, [PHOTO])).toHaveLength(1);
  });

  it('finds nothing for media no post mentions', () => {
    expect(postsEmbedding(posts, [`${BUCKET}/photos/unused.webp`])).toEqual([]);
    expect(postsEmbedding(posts, [])).toEqual([]);
    expect(postsEmbedding([], [PHOTO])).toEqual([]);
  });
});

describe('mediaInUseMessage', () => {
  it('names the single entry and says what to do', () => {
    const message = mediaInUseMessage('photo', [{ title: 'A morning in Namsan', draft: false }]);
    expect(message).toContain('“A morning in Namsan”');
    expect(message).toContain('journal entry');
    expect(message).toMatch(/photo/);
    expect(message).toMatch(/first/);
  });

  it('lists every entry when there are several', () => {
    const message = mediaInUseMessage('clip', [
      { title: 'One', draft: false },
      { title: 'Two', draft: false },
    ]);
    expect(message).toContain('2 journal entries');
    expect(message).toContain('“One”, “Two”');
  });

  it('marks drafts, since the admin judges those differently', () => {
    expect(mediaInUseMessage('photo', [{ title: 'Unfinished', draft: true }])).toContain(
      '“Unfinished” (draft)',
    );
  });

  // A long list has to stay a sentence someone can read.
  it('counts the tail rather than listing twenty titles', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `Post ${i}`, draft: false }));
    const message = mediaInUseMessage('photo', many);
    expect(message).toContain('8 journal entries');
    expect(message).toContain('and 3 more');
    expect(message).not.toContain('“Post 5”');
  });
});
