import { SubscribeForm } from './SubscribeForm';

/**
 * The foot of a journal post: the one moment a reader has just shown they want
 * more of exactly this, so the form is right there rather than a link away.
 * Journal only by default — that is what the reader came for — and every email
 * carries the link to add Motion and Stills.
 *
 * Laid out on the sheet's own grid, so the label sits in the margin column
 * beside the rule the way the post's date does.
 */
export function PostSignup() {
  return (
    <section aria-labelledby="post-signup-title" className="journal-grid mt-16 border-t border-hairline pt-10">
      <div className="journal-margin">Newsletter</div>
      <div>
        <h2 id="post-signup-title" className="font-journal text-xl font-semibold">
          Get the next post by email
        </h2>
        <p className="mt-1 mb-4 text-sm text-ash">
          One email when something new goes up. Nothing else, and one click to leave.
        </p>
        <SubscribeForm inline fixedPrefs={{ journal: true, motion: false, stills: false }} />
      </div>
    </section>
  );
}
