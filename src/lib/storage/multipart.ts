import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, bucket, publicUrl } from './r2';

/**
 * Server-side multipart upload orchestration. Multipart rather than a single PUT
 * because a 1 GB video that fails at 90% would otherwise restart from zero —
 * this way individual parts can be retried.
 *
 * The file bytes never pass through the Next.js server: it only mints presigned
 * part URLs that the browser uploads to directly.
 */

export interface CompletedPart {
  ETag: string;
  PartNumber: number;
}

const PART_URL_TTL_SECONDS = 3600;

/** Returns the R2 upload id. */
export async function createMultipart(key: string, contentType: string): Promise<string> {
  const response = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!response.UploadId) throw new Error('R2 did not return an upload id');
  return response.UploadId;
}

export async function signPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: PART_URL_TTL_SECONDS },
  );
}

/** Returns the public URL of the assembled object. */
export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<string> {
  // S3 requires parts in ascending order; don't trust the client's ordering.
  const ordered = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: ordered },
    }),
  );
  return publicUrl(key);
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }),
  );
}
