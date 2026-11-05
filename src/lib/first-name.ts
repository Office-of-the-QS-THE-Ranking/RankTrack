/** The first name as people write it: directory names often arrive in capitals. */
export function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first === first.toUpperCase() ? first.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, mark: string, letter: string) => mark + letter.toUpperCase()) : first;
}
