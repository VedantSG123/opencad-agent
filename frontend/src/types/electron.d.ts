export interface ElectronAPI {
  isElectron: boolean
  pingBackend: () => Promise<string>
  openFileDialog: (options: {
    mode: 'file' | 'directory'
    extension?: string
  }) => Promise<{ canceled: boolean; filePaths: string[] }>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  readdir: (dirPath: string) => Promise<string[]>
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
