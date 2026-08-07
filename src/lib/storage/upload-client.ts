/**
 * Browser-side multipart uploader. Slices the file, asks /api/upload/part-url for
 * a presigned URL per part, PUTs each part straight to R2, then calls
 * /api/upload/complete and returns the public URL. A part that fails for a reason
 * a second attempt could fix is retried with backoff — the payoff multipart was
 * adopted for, since without it a dropped connection at 90% costs the whole file.
 *
 * Requires `ExposeHeaders: ["ETag"]` in the bucket's CORS policy — without it the
 * browser hides the ETag and the upload cannot be completed.
 */

export type UploadPrefix = 'photos' | 'videos' | 'posters' | 'sprites' | 'journal';

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

/** Carries the status alongside the message so the retry policy can read it. */
export class UploadHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UploadHttpError';
  }
}

/** Total attempts per part, first try included. */
export const PART_ATTEMPTS = 4;

/**
 * Retry only what a second attempt could plausibly fix. A 401/403 means the
 * session expired mid-upload and every further attempt costs the user more time
 * before the same message; a 4xx below is a request we built wrong and will keep
 * building wrong. `undefined` is a thrown fetch — DNS, a dropped connection, a
 * tunnel closing — which is the failure this whole retry exists for.
 */
export function shouldRetry(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/**
 * Exponential, capped, and deliberately not jittered: one browser uploading its
 * parts sequentially is not a herd, so jitter would only make the wait harder to
 * reason about and the test non-deterministic.
 */
export function backoffDelay(attempt: number, base = 300, cap = 8_000): number {
  return Math.min(base * 2 ** Math.max(0, attempt - 1), cap);
}

/**
 * The upload routes answer every refusal with `{ error }`; a proxy or gateway in
 * front of them answers with HTML or nothing at all. Prefer the route's own
 * message — "Your session expired" beats "failed with status 401" — and fall
 * back to the status when there is no JSON body to read.
 */
async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new UploadHttpError(
      message ? `${path}: ${message}` : `${path} failed with status ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === 'string' && error.length > 0) return error;
    }
  } catch {
    // Non-JSON body — a gateway's HTML 502, or an empty response.
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  // A zero-byte blob splits into no parts, and the completion route rejects an
  // empty `parts` array as "Invalid completion request" — the one message in this
  // path that names nothing. Reachable when a canvas encode yields an empty blob,
  // so say that instead, before an upload is even created.
  if (file.size === 0) {
    throw new Error(`${filename} is empty (0 bytes) — nothing to upload`);
  }

  const { key, uploadId } = await postJson<{ key: string; uploadId: string }>(
    '/api/upload/create',
    { filename, contentType: file.type || 'application/octet-stream', prefix },
  );

  const ranges = splitIntoParts(file.size);
  const completed: { ETag: string; PartNumber: number }[] = [];
  // Progress is byte-weighted and only credited once a part is confirmed, so a
  // retried part is never counted twice and the bar cannot run backwards. fetch
  // exposes no upload-progress events, so a part is still the finest granularity
  // available — byte weighting is what stops a short final part counting as much
  // as a full one, and a 3 MiB photo from being the whole bar in one jump.
  let uploadedBytes = 0;

  try {
    for (const range of ranges) {
      const { ETag } = await uploadPart(file, range, key, uploadId);
      completed.push({ ETag, PartNumber: range.partNumber });
      uploadedBytes += range.end - range.start;
      onProgress?.(Math.round((uploadedBytes / file.size) * 100));
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
 * Sends one part, retrying the transient failures multipart was adopted to
 * survive. The part URL is re-signed on every attempt rather than re-PUT: a
 * presigned URL has a fixed lifetime, and the attempt most worth retrying is the
 * one late in a multi-hundred-MB upload, by which point the URL we are holding
 * may be the thing that expired. One extra same-origin round-trip is nothing
 * against re-sending the part, and it means a 403 from R2 is a real refusal
 * rather than an expiry we could have signed our way out of.
 *
 * A missing ETag is not retried — it means the bucket's CORS policy omits
 * ExposeHeaders, and every attempt will hide the header exactly the same way.
 */
async function uploadPart(
  file: Blob,
  range: PartRange,
  key: string,
  uploadId: string,
): Promise<{ ETag: string }> {
  const body = file.slice(range.start, range.end);
  let lastError: unknown;

  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt += 1) {
    try {
      const { url } = await postJson<{ url: string }>('/api/upload/part-url', {
        key,
        uploadId,
        partNumber: range.partNumber,
      });

      const response = await fetch(url, { method: 'PUT', body });
      if (!response.ok) {
        throw new UploadHttpError(
          `Part ${range.partNumber} failed with status ${response.status}`,
          response.status,
        );
      }

      const etag = response.headers.get('ETag');
      if (!etag) {
        throw new Error(
          `Part ${range.partNumber} response was missing an ETag header — check the bucket's CORS ExposeHeaders`,
        );
      }
      return { ETag: etag };
    } catch (cause) {
      const status = cause instanceof UploadHttpError ? cause.status : undefined;
      const transient = cause instanceof UploadHttpError || isNetworkError(cause);
      if (!transient || !shouldRetry(status) || attempt === PART_ATTEMPTS) throw cause;
      lastError = cause;
      await sleep(backoffDelay(attempt));
    }
  }

  throw lastError;
}

/**
 * Anything thrown by `fetch` itself rather than returned by it: the connection
 * never completed, which is the one failure worth another go. Errors we raised
 * above are `UploadHttpError`, so they are classified by status instead.
 */
function isNetworkError(cause: unknown): boolean {
  return cause instanceof TypeError;
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
