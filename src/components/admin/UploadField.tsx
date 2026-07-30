'use client';

import { useState } from 'react';
import { uploadFile, type UploadPrefix } from '@/lib/storage/upload-client';
import { LABEL } from './fields';

interface Props {
  label: string;
  accept: string;
  prefix: UploadPrefix;
  value: string;
  onUploaded: (url: string, file: File) => void | Promise<void>;
  hint?: string;
  warnAboveBytes?: number;
}

export function UploadField({
  label,
  accept,
  prefix,
  value,
  onUploaded,
  hint,
  warnAboveBytes,
}: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    // Warn rather than reject: the size limit is guidance, not a rule.
    setWarning(
      warnAboveBytes && file.size > warnAboveBytes
        ? `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — larger than expected. Upload the compressed web encode, not the 4K master.`
        : '',
    );

    try {
      setProgress(0);
      const url = await uploadFile(file, file.name, prefix, setProgress);
      await onUploaded(url, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="text-sm text-ash file:mr-3 file:rounded file:border file:border-hairline file:bg-frame file:px-3 file:py-1 file:text-bone"
      />
      {hint ? <span className="text-xs text-ash">{hint}</span> : null}
      {progress !== null ? (
        <span className="text-xs text-gold">Uploading… {progress}%</span>
      ) : null}
      {warning ? <span className="text-xs text-amber-400">{warning}</span> : null}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
      {value ? <span className="truncate text-xs text-ash">Stored: {value}</span> : null}
    </label>
  );
}
