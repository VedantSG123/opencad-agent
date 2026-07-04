declare module 'virtual:replicad-types' {
  const types: string
  export default types
}

declare module 'istextorbinary' {
  export function isText(filename: string | null, buffer?: Uint8Array): boolean
  export function isBinary(
    filename: string | null,
    buffer?: Uint8Array,
  ): boolean
  export function getEncoding(buffer: Uint8Array): string
}
