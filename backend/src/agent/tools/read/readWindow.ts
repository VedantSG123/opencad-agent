import { open } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'

const CHUNK_BYTES = 64 * 1024
const NUL_SNIFF_BYTES = 8 * 1024

export type ReadWindowOptions = {
  absolutePath: string
  offset: number
  limit: number
  maxLineChars: number
  maxOutputChars: number
  maxScanBytes: number
  abortSignal: AbortSignal | undefined
}

export type LineWindow = {
  lines: string[]
  firstLineNumber: number
  clippedLines: number
  /** Known only when the read reached the end of the file. */
  totalLines: number | null
  continues: boolean
  stoppedAtOutputBudget: boolean
  stoppedAtScanBudget: boolean
  isBinary: boolean
}

/**
 * Walks the file in chunks and keeps only the requested window, so a 1 GB file
 * costs the same as a small one as long as `offset` is near the top.
 */
export async function readWindow({
  absolutePath,
  offset,
  limit,
  maxLineChars,
  maxOutputChars,
  maxScanBytes,
  abortSignal,
}: ReadWindowOptions): Promise<LineWindow> {
  const lines: string[] = []
  let clippedLines = 0
  let lineNumber = 1
  let outputChars = 0
  let partialLine = ''
  let partialClipped = false
  let tailAfterWindow = ''
  let windowClosed = false
  let stoppedAtOutputBudget = false
  let stoppedAtScanBudget = false
  let totalLines: number | null = null
  let continues = false
  let scannedBytes = 0

  const growPartialLine = (text: string) => {
    const room = maxLineChars - partialLine.length
    if (text.length > room) {
      partialLine += text.slice(0, Math.max(room, 0))
      partialClipped = true
      return
    }
    partialLine += text
  }

  const finishLine = () => {
    const text = partialLine.endsWith('\r')
      ? partialLine.slice(0, -1)
      : partialLine
    const clipped = partialClipped
    partialLine = ''
    partialClipped = false

    if (lineNumber < offset) {
      lineNumber++
      return
    }

    if (lines.length > 0 && outputChars + text.length > maxOutputChars) {
      stoppedAtOutputBudget = true
      windowClosed = true
      continues = true
      return
    }

    lines.push(text)
    outputChars += text.length + 1
    if (clipped) clippedLines++
    lineNumber++

    if (lines.length >= limit) windowClosed = true
  }

  const consume = (text: string) => {
    let cursor = 0
    while (!windowClosed) {
      const lineEnd = text.indexOf('\n', cursor)
      if (lineEnd === -1) {
        growPartialLine(text.slice(cursor))
        return
      }
      growPartialLine(text.slice(cursor, lineEnd))
      finishLine()
      cursor = lineEnd + 1
    }
    tailAfterWindow += text.slice(cursor)
  }

  // A chunk boundary can fall inside a multi-byte character; StringDecoder
  // holds those bytes back instead of emitting a replacement character.
  const decoder = new StringDecoder('utf8')
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES)
  const handle = await open(absolutePath, 'r')

  try {
    let sniffedForNul = false

    while (!windowClosed) {
      abortSignal?.throwIfAborted()
      const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, null)

      if (bytesRead === 0) {
        consume(decoder.end())
        if (partialLine !== '' || partialClipped) finishLine()
        totalLines = lineNumber - 1
        break
      }

      if (!sniffedForNul) {
        sniffedForNul = true
        const sniffLength = Math.min(bytesRead, NUL_SNIFF_BYTES)
        if (buffer.subarray(0, sniffLength).includes(0)) {
          return {
            lines: [],
            firstLineNumber: offset,
            clippedLines: 0,
            totalLines: null,
            continues: false,
            stoppedAtOutputBudget: false,
            stoppedAtScanBudget: false,
            isBinary: true,
          }
        }
      }

      scannedBytes += bytesRead
      consume(decoder.write(buffer.subarray(0, bytesRead)))

      if (!windowClosed && scannedBytes >= maxScanBytes) {
        stoppedAtScanBudget = true
        continues = true
        break
      }
    }

    if (windowClosed && !continues) {
      if (tailAfterWindow !== '' || partialLine !== '' || partialClipped) {
        continues = true
      } else {
        // The window filled up exactly at a chunk boundary: only another read
        // can tell an exhausted file from one with more lines.
        const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, null)
        if (bytesRead > 0) {
          continues = true
        } else {
          totalLines = lineNumber - 1
        }
      }
    }
  } finally {
    await handle.close()
  }

  return {
    lines,
    firstLineNumber: offset,
    clippedLines,
    totalLines,
    continues,
    stoppedAtOutputBudget,
    stoppedAtScanBudget,
    isBinary: false,
  }
}
