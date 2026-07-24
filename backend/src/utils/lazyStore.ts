/**
 * Creates a lazily-initialized store around any async loader.
 * The loader is called exactly once — on the first `.get()` call.
 * All concurrent first-callers await the same Promise.
 */
export function createLazyStore<T>(loader: () => Promise<T>) {
  let value: T | undefined
  let promise: Promise<void> | null = null

  function load(): Promise<void> {
    promise = loader().then((v) => {
      value = v
    })
    return promise
  }

  return {
    get(): Promise<T> {
      if (!promise) load()
      return promise!.then(() => value as T)
    },
    /** Forces a fresh reload from the loader, bypassing the cached value. */
    refresh(): Promise<T> {
      return load().then(() => value as T)
    },
  }
}
