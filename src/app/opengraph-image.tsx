import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * The card a link to this site unfurls as in Slack, iMessage and every social
 * feed. Generated rather than checked in as a PNG so it cannot drift from
 * SITE_NAME, and so there is no binary in the repo to re-export by hand.
 *
 * Built at build time — the route is static, since nothing here reads a request.
 *
 * Deliberately typographic, not a photograph: the wall's contents change, and a
 * card showing one frame from it would misrepresent the site the moment that
 * photo came down.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;

// Theme tokens, copied literally: this renders through satori, which never sees
// the stylesheet.
const INK = '#0b0b0d';
const BONE = '#f4f4f5';
const GOLD = '#d4af37';
const ASH = '#8e8e93';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: INK,
          padding: '0 96px',
          // The film rail down the left edge, echoing the motion page's
          // perforations — the one piece of the site's own furniture that
          // survives being reduced to a static card.
          borderLeft: `24px solid ${GOLD}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: GOLD,
          }}
        >
          Stills · Motion · Journal
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 104,
            lineHeight: 1.05,
            color: BONE,
          }}
        >
          {SITE_NAME}
        </div>
        <div style={{ display: 'flex', marginTop: 24, fontSize: 40, color: ASH }}>
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    size,
  );
}
