/**
 * Base implementation taken from: https://github.com/jonschlinkert/open-windows-file-dialog
 */
import cp from 'node:child_process'
import path from 'node:path'
import util from 'node:util'

const execAsync = util.promisify(cp.exec)

interface FileDialogOptions {
  multiple?: boolean
  checkFileExists?: boolean
  filter?: string
  title?: string
  defaultExtension?: string
  maxTimeout?: number
  directoryOnly?: boolean
}

interface FileDialogResult {
  files: string[]
  canceled: boolean
}

class FileDialogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileDialogError'
  }
}

const isCanceled = (v: string): boolean => /cancell?ed/i.test(v)

// Escape special characters for PowerShell
const escapeForPowerShell = (str: string): string => {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '`"').replace(/\$/g, '`$')
}

const buildFilterString = (filter: string): string => {
  // Handle common filter formats
  if (filter === '*' || filter === '*.*') {
    return 'All files (*.*)|*.*'
  }

  // If it's already in the correct format, return as is
  if (filter.includes('|')) {
    return filter
  }

  // Convert simple patterns to proper format
  // e.g., "*.txt" becomes "Text files (*.txt)|*.txt"
  const ext = filter.replace('*', '').replace('.', '')
  if (ext) {
    return `${ext.toUpperCase()} files (${filter})|${filter}`
  }

  return 'All files (*.*)|*.*'
}

const checkPowerShellAvailable = async (): Promise<boolean> => {
  try {
    const { stdout } = await execAsync('powershell.exe -Command "echo test"', {
      timeout: 5000,
    })
    return stdout.trim() === 'test'
  } catch {
    return false
  }
}

export const openWindowsFileDialog = async (
  filepath: string = process.cwd(),
  options: FileDialogOptions = {},
): Promise<FileDialogResult> => {
  if (typeof filepath !== 'string') {
    throw new FileDialogError('Filepath must be a string')
  }

  const normalizedPath = path.resolve(filepath)
  const isPowerShellAvailable = await checkPowerShellAvailable()
  if (!isPowerShellAvailable) {
    throw new FileDialogError('PowerShell is not available on this system')
  }

  const opts: Required<FileDialogOptions> = {
    multiple: true,
    checkFileExists: true,
    filter: '*.*',
    title: 'Select File(s)',
    defaultExtension: '',
    maxTimeout: 5 * 60 * 1000, // 5 minutes
    directoryOnly: false,
    ...options,
  }

  const escapedPath = escapeForPowerShell(normalizedPath)
  const escapedTitle = escapeForPowerShell(opts.title)
  const pathSeparator = '|<<PATH_SEPARATOR>>|'

  let powershellScript: string

  if (opts.directoryOnly) {
    powershellScript = `
      try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Application]::EnableVisualStyles()

        $FolderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
        $FolderBrowser.Description = "${escapedTitle}"
        $FolderBrowser.SelectedPath = "${escapedPath}"
        $FolderBrowser.ShowNewFolderButton = $true

        $DialogResult = $FolderBrowser.ShowDialog()

        if ($DialogResult -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Host $FolderBrowser.SelectedPath
        } else {
          Write-Host "CANCELLED"
        }
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      }
    `
  } else {
    const filterString = buildFilterString(opts.filter)
    powershellScript = `
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Application]::EnableVisualStyles()

      $OpenFileDialog = New-Object System.Windows.Forms.OpenFileDialog
      $OpenFileDialog.Multiselect = ${opts.multiple ? '$true' : '$false'}
      $OpenFileDialog.InitialDirectory = "${escapedPath}"
      $OpenFileDialog.Filter = "${escapeForPowerShell(filterString)}"
      $OpenFileDialog.CheckFileExists = ${opts.checkFileExists ? '$true' : '$false'}
      $OpenFileDialog.CheckPathExists = $true
      $OpenFileDialog.SupportMultiDottedExtensions = $true
      $OpenFileDialog.Title = "${escapedTitle}"
      $OpenFileDialog.RestoreDirectory = $true
      ${opts.defaultExtension ? `$OpenFileDialog.DefaultExt = "${escapeForPowerShell(opts.defaultExtension)}"` : ''}

      # Ensure dialog appears on top
      $OpenFileDialog.ShowHelp = $false

      $DialogResult = $OpenFileDialog.ShowDialog()

      if ($DialogResult -eq [System.Windows.Forms.DialogResult]::OK) {
        foreach ($FileName in $OpenFileDialog.FileNames) {
          Write-Host "$FileName${pathSeparator}"
        }
      } else {
        Write-Host "CANCELLED"
      }
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `
  }

  return new Promise((resolve, reject) => {
    const child = cp.spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        '-',
      ],
      {
        windowsHide: true,
        shell: false,
      },
    )

    let stdoutData = ''
    let stderrData = ''
    let hasResolved = false

    child.stdout.on('data', (data: Buffer) => {
      stdoutData += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString()
    })

    child.on('error', (error) => {
      if (!hasResolved) {
        hasResolved = true
        reject(
          new FileDialogError(`Failed to spawn PowerShell: ${error.message}`),
        )
      }
    })

    child.on('close', (code) => {
      if (hasResolved) return
      hasResolved = true

      if (code !== 0 && stderrData) {
        const errorMessage = stderrData.trim()
        reject(new FileDialogError(`PowerShell error: ${errorMessage}`))
        return
      }

      const output = stdoutData.trim()

      if (isCanceled(output)) {
        resolve({ files: [], canceled: true })
        return
      }

      const files = output
        .split(pathSeparator)
        .map((s) => s.trim())
        .filter((s) => s !== '')

      const validFiles = files.filter((f) => path.isAbsolute(f))
      if (validFiles.length !== files.length) {
        console.warn('Some file paths were not absolute and were filtered out')
      }

      resolve({ files: validFiles, canceled: false })
    })

    if (opts.maxTimeout) {
      // If maxTimeout is set, set timeout to kill the process if it takes too long
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true
          child.kill()
          reject(new FileDialogError('Dialog timeout after 5 minutes'))
        }
      }, opts.maxTimeout)

      child.on('exit', () => {
        clearTimeout(timeout)
      })
    }

    child.stdin.write(powershellScript)
    child.stdin.end()
  })
}

export const openWindowsFileDialogSync = async (
  filepath?: string,
  options?: FileDialogOptions,
): Promise<string[]> => {
  const result = await openWindowsFileDialog(filepath, options)
  return result.files
}

export default openWindowsFileDialog
