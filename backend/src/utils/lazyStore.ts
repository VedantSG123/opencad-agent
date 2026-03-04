/**
 * Creates a lazily-initialized store around any async loader.
 * The loader is called exactly once — on the first `.get()` call.
 * All concurrent first-callers await the same Promise.
 */
export function createLazyStore<T>(loader: () => Promise<T>) {
  let value: T | undefined
  let promise: Promise<void> | null = null

  return {
    get(): Promise<T> {
      if (!promise)
        promise = loader().then((v) => {
          value = v
        })
      return promise.then(() => value as T)
    },
  }
}
