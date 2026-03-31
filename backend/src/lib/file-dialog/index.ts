import fs from 'node:fs'
import os from 'node:os'

import { USER_DOCUMENTS_DIR, USER_HOME_DIR } from '../../utils/directories'
import { openLinuxFileDialog } from './linux'
import { openFinderDialog } from './macos'
import { openWindowsFileDialog } from './windows'

interface FileDialogResult {
  files: string[]
  canceled: boolean
}

export async function openFileDialog(
  directory: string = process.cwd(),
  fileTypes: string[],
  multiple = false,
  title: string = 'Select files',
): Promise<FileDialogResult> {
  const platform = os.platform()

  switch (platform) {
    case 'linux': {
      const files = await openLinuxFileDialog(directory, {
        title,
        multiple,
        fileTypes,
      })
      return { files, canceled: files.length === 0 }
    }

    case 'darwin': {
      return await openFinderDialog(directory, {
        filters: fileTypes,
        limit: multiple ? 100 : 1,
      })
    }

    case 'win32': {
      const filter = fileTypes.length > 0 ? fileTypes.join(';') : '*.*'
      return await openWindowsFileDialog(directory, {
        multiple,
        title,
        filter,
      })
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

export function getUserDocumentsDir(): string {
  if (fs.existsSync(USER_DOCUMENTS_DIR)) {
    return USER_DOCUMENTS_DIR
  } else {
    return USER_HOME_DIR
  }
}
