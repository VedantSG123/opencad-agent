// @zenfs/core assigns globalThis.__zenfs__ on init, which Bun treats as
// read-only if already defined. Make it writable/configurable up front.
Object.defineProperty(globalThis, '__zenfs__', {
  configurable: true,
  writable: true,
  value: undefined,
})
