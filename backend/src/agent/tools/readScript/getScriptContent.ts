import { readFile } from 'fs/promises'
import path from 'path'

export const SCRIPT_PATH = path.join(process.cwd(), 'resources', 'replicad.js')

export async function getScriptContent(): Promise<string> {
  try {
    const content = await readFile(SCRIPT_PATH, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading script file:', error)
    throw new Error(
      `Failed to read script file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    )
  }
}
