/**
 * Masks a student name for privacy:
 * - 3+ characters: replace middle char(s) with 'O' → 김O준
 * - 2 characters: replace second char with 'O' → 이O
 * - 1 character or empty: return as-is
 */
export function maskName(name: string | undefined | null): string {
  if (!name) return '';
  const len = name.length;
  if (len === 2) return name[0] + 'O';
  if (len >= 3) return name[0] + 'O' + name.slice(2);
  return name;
}
