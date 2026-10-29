import { z } from 'zod';

/**
 * A subscriber's address as stored. Lowercased because the unique index is
 * what stops one inbox subscribing twice, and `Me@x.com` / `me@x.com` are the
 * same inbox in practice even though the local part is technically
 * case-sensitive — no provider anyone uses treats it that way.
 *
 * 254 is the longest address SMTP will carry; anything longer cannot be
 * delivered, so there is no point storing it.
 */
export const subscriberEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That address is too long')
  .pipe(z.email('Enter a valid email address'));
