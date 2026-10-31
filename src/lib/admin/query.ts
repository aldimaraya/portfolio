/** A query-string value as one string: Next hands a repeated key over as an array, and the first one wins. */
export const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
