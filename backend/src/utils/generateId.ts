import { randomBytes } from 'crypto'

const ID_LENGTH = 26

let currentTimestamp = 0
let counter = 0

function randeomBase62(length: number): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

export function generateId(descending: boolean = false): string {
  const timestamp = Date.now()

  if (timestamp !== currentTimestamp) {
    counter = 0
  }
  counter++
  currentTimestamp = timestamp

  // 12 bits for counter, 2^12 = 4096 IDs in the same millisecond, after that collision is possible
  let now = (BigInt(timestamp) << BigInt(12)) | BigInt(counter)

  if (descending) {
    now = ~now
  }

  const timeBuffer = Buffer.alloc(6)

  for (let i = 0; i < 6; i++) {
    // Extract 8 bits for each byte, starting from the most significant byte
    timeBuffer[i] = Number((now >> BigInt(40 - i * 8)) & BigInt(0xff))
  }

  return timeBuffer.toString('hex') + randeomBase62(ID_LENGTH - 12)
}

export const ID_PREFIX_MAP = {
  project: 'prj',
  session: 'ses',
  message: 'msg',
  part: 'prt',
  permission: 'perm',
} as const

export function generateIdWithPrefix(
  prefix: keyof typeof ID_PREFIX_MAP,
  descending: boolean = false,
): string {
  return `${ID_PREFIX_MAP[prefix]}_${generateId(descending)}`
}
