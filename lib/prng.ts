import webCrypto from 'expo-standard-web-crypto';

/**
 * CSPRNG for tweetnacl on React Native.
 *
 * tweetnacl binds its random generator at module load from `self.crypto`
 * and throws 'no PRNG' where the WebCrypto global does not exist — which
 * is every native build. That single throw broke ALL message sends (text
 * and voice, DM and group) because key setup and every encryption need
 * randomness. This module installs expo-standard-web-crypto's audited
 * getRandomValues (backed by expo-crypto's native CSPRNG) as the global
 * BEFORE tweetnacl loads, so it must stay the first import of the app
 * entry and of every tweetnacl consumer (see check-prng.mjs).
 *
 * The package's own polyfillWebCrypto() is intentionally not used: it
 * writes to `window`, which does not exist on native.
 */
const g = globalThis as unknown as Record<string, any>;
if (
  typeof g.crypto === 'undefined' ||
  typeof g.crypto.getRandomValues !== 'function'
) {
  g.crypto = g.crypto ?? {};
  // The package types its default export as `globalThis.Crypto | Crypto`,
  // a union whose overloads TS cannot call directly; collapse to one.
  const getRandomValues = webCrypto.getRandomValues as <
    T extends ArrayBufferView,
  >(
    values: T,
  ) => T;
  g.crypto.getRandomValues = <T extends ArrayBufferView>(values: T): T =>
    getRandomValues(values);
}
// tweetnacl reads `self.crypto`, and `self` itself may not exist natively.
if (typeof g.self === 'undefined' || g.self === null) {
  g.self = g;
} else if (typeof g.self.crypto === 'undefined') {
  g.self.crypto = g.crypto;
}
