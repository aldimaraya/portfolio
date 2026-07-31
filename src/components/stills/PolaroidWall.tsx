import { Polaroid, type PolaroidPhoto } from './Polaroid';

/**
 * Justified rows via plain flex-wrap: each polaroid's flex-basis is proportional
 * to its aspect ratio, so a row grows its items to fill the width. Order comes in
 * already sorted by colour — see sortPhotosForWall.
 */
export function PolaroidWall({ photos }: { photos: PolaroidPhoto[] }) {
  if (photos.length === 0) {
    return <p className="text-sm text-ash">No photos match these filters.</p>;
  }

  return (
    <div className="flex flex-wrap gap-5">
      {photos.map((photo) => (
        <Polaroid key={photo.id} photo={photo} />
      ))}
    </div>
  );
}
