// Some browsers expose storage as a throwing getter (privacy/embedded mode).
export function localStorageOrNull(win) {
  try { return win.localStorage; } catch { return null; }
}

// randomUUID is newer than getRandomValues in Safari. Keep IDs cryptographically
// random and RFC 4122 compatible; never fall back to Math.random for game IDs.
export function randomUUID(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  if (typeof cryptoObject?.getRandomValues !== 'function') throw new Error('Безопасный генератор случайных чисел недоступен.');
  const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
