import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { articleSchema, personSchema, videoSchema } from '@/lib/schema';

// siteUrl() reads process.env at call time, so the builders can be pinned to a
// known origin rather than asserted against localhost.
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe('personSchema', () => {
  it('is a Person carrying the site name', () => {
    const schema = personSchema();
    expect(schema['@type']).toBe('Person');
    expect(schema.name).toBe('Aldi Maraya');
  });

  it('anchors an @id the other schemas can reference', () => {
    expect(personSchema()['@id']).toBe('https://example.test/#person');
  });

  // An empty sameAs claims no profiles, which reads worse than making no claim.
  it('omits sameAs entirely while no social links are configured', () => {
    expect(personSchema()).not.toHaveProperty('sameAs');
  });
});

describe('articleSchema', () => {
  const post = {
    slug: 'hello-world',
    title: 'Hello World',
    description: 'A first post.',
    publishedAt: new Date('2026-01-02T03:04:05.000Z'),
  };

  it('builds an absolute url from the slug', () => {
    expect(articleSchema(post).url).toBe('https://example.test/journal/hello-world');
  });

  it('states the publish date in ISO 8601', () => {
    expect(articleSchema(post).datePublished).toBe('2026-01-02T03:04:05.000Z');
  });

  it('references the person by @id rather than restating them', () => {
    expect(articleSchema(post).author).toEqual({ '@id': 'https://example.test/#person' });
  });
});

describe('videoSchema', () => {
  const clip = {
    id: 'abc123',
    title: 'A Clip',
    description: 'Some blurb.',
    posterImageUrl: 'https://media.example.test/poster.jpg',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    durationSeconds: 92,
  };

  it('carries the thumbnail and upload date a video result requires', () => {
    const schema = videoSchema(clip);
    expect(schema.thumbnailUrl).toBe('https://media.example.test/poster.jpg');
    expect(schema.uploadDate).toBe('2026-01-02T03:04:05.000Z');
  });

  it('expresses duration as an ISO 8601 period', () => {
    expect(videoSchema(clip).duration).toBe('PT92S');
  });

  it('rounds a fractional duration, which the short form cannot represent', () => {
    expect(videoSchema({ ...clip, durationSeconds: 92.6 }).duration).toBe('PT93S');
  });

  it('omits duration when it is unknown', () => {
    expect(videoSchema({ ...clip, durationSeconds: null })).not.toHaveProperty('duration');
  });

  // description is a required property, so a blank blurb has to fall back.
  it('falls back to the title when the clip has no description', () => {
    expect(videoSchema({ ...clip, description: '' }).description).toBe('A Clip');
  });
});
