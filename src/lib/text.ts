/** "a title" · "a title and a roll" · "a video, a title and a roll". */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
