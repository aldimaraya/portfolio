/**
 * Browser-side multipart uploader. Slices the file, asks /api/upload/part-url for
 * a presigned URL per part, PUTs each part straight to R2, then calls
 * /api/upload/complete and returns the public URL.
 *
 * Requires `ExposeHeaders: ["ETag"]` in the bucket's CORS policy — without it the
 * browser hides the ETag and the upload cannot be completed.
 */

export type UploadPrefix = 'photos' | 'videos' | 'posters' | 'sprites';

/** R2 requires every part except the last to be at least 5 MiB. */
export const MIN_PART_SIZE = 5 * 1024 * 1024;

export interface PartRange {
  partNumber: number;
  start: number;
  end: number;
}

export function splitIntoParts(size: number, partSize: number = MIN_PART_SIZE): PartRange[] {
  if (size <= 0) return [];
  if (size <= partSize) return [{ partNumber: 1, start: 0, end: size }];

  const parts: PartRange[] = [];
  let start = 0;
  let partNumber = 1;
  while (start < size) {
    const end = Math.min(start + partSize, size);
    parts.push({ partNumber, start, end });
    start = end;
    partNumber += 1;
  }
  return parts;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Uploads a file to R2 in parts and returns its public URL. Parts are sent
 * sequentially so a failure surfaces the specific part rather than dying
 * somewhere inside a parallel batch — worth it for multi-hundred-MB videos.
 */
export async function uploadFile(
  file: Blob,
  filename: string,
  prefix: UploadPrefix,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { key, uploadId } = await postJson<{ key: string; uploadId: string }>(
    '/api/upload/create',
    { filename, contentType: file.type || 'application/octet-stream', prefix },
  );

  const ranges = splitIntoParts(file.size);
  const completed: { ETag: string; PartNumber: number }[] = [];

  try {
    for (const range of ranges) {
      const { url } = await postJson<{ url: string }>('/api/upload/part-url', {
        key,
        uploadId,
        partNumber: range.partNumber,
      });

      const response = await fetch(url, {
        method: 'PUT',
        body: file.slice(range.start, range.end),
      });
      if (!response.ok) {
        throw new Error(`Part ${range.partNumber} failed with status ${response.status}`);
      }

      const etag = response.headers.get('ETag');
      if (!etag) {
        throw new Error(
          `Part ${range.partNumber} response was missing an ETag header — check the bucket's CORS ExposeHeaders`,
        );
      }

      completed.push({ ETag: etag, PartNumber: range.partNumber });
      onProgress?.(Math.round((completed.length / ranges.length) * 100));
    }

    const { url } = await postJson<{ url: string }>('/api/upload/complete', {
      key,
      uploadId,
      parts: completed,
    });
    return url;
  } catch (cause) {
    // An upload that will never be completed still holds every part it managed
    // to send — stored and billed, and absent from a normal object listing, so
    // nothing about the bucket would ever show you they are there.
    await abortQuietly(key, uploadId);
    throw cause;
  }
}

/**
 * Cleanup on a path that is already failing, so the abort must never become the
 * error the caller sees: whatever broke the upload is the more useful message.
 * A tab closed mid-upload never reaches this at all, which is what the bucket's
 * AbortIncompleteMultipartUpload lifecycle rule is there to catch.
 */
async function abortQuietly(key: string, uploadId: string): Promise<void> {
  try {
    await postJson('/api/upload/abort', { key, uploadId });
  } catch (cause) {
    console.error('Could not abort the incomplete upload', key, cause);
  }
}
