/** FNV-1a (32 bit) als stabile Inhalts-ID – reicht zum Wiedererkennen derselben Datei. */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + bytes.length.toString(16);
}
