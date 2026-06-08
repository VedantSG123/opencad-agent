import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  isElectron: boolean;
  pingBackend: () => Promise<string>;
  openFileDialog: (options: {
    mode: "file" | "directory";
    extension?: string;
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readdir: (dirPath: string) => Promise<string[]>;
}

const api: ElectronAPI = {
  isElectron: true,
  pingBackend: () => ipcRenderer.invoke("ping-backend"),
  openFileDialog: (options) => ipcRenderer.invoke("open-file-dialog", options),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("write-file", filePath, content),
  readdir: (dirPath) => ipcRenderer.invoke("readdir", dirPath),
};

contextBridge.exposeInMainWorld("electron", api);
export type { api };
