import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";

export interface WatchEvent {
  event: "fs:watch";
  type: "change" | "add" | "unlink" | "addDir" | "unlinkDir";
  path: string;
}

export interface FSEntryPlain {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export interface ElectronAPI {
  isElectron: boolean;
  backendPort: number;
  pingBackend: () => Promise<Result<string>>;
  openFileDialog: (options: {
    mode: "file" | "directory";
    extension?: string;
  }) => Promise<Result<{ canceled: boolean; filePaths: string[] }>>;
  readFile: (filePath: string) => Promise<Result<string>>;
  writeFile: (filePath: string, content: string) => Promise<Result<void>>;
  readdir: (dirPath: string) => Promise<Result<string[]>>;
  readdirWithTypes: (dirPath: string) => Promise<Result<FSEntryPlain[]>>;
  watchDirectory: (dirPath: string) => Promise<Result<void>>;
  onWatch: (handler: (event: WatchEvent) => void) => () => void;
  refreshProjectRoots: () => Promise<Result<{ count: number }>>;
  addProjectRoot: (directory: string) => Promise<Result<{ count: number }>>;
}

// Find --backend-port in process.argv
const portArg = process.argv.find((arg) => arg.startsWith("--backend-port="));
const backendPort = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;

const api: ElectronAPI = {
  isElectron: true,
  backendPort,
  pingBackend: () => ipcRenderer.invoke("backend:ping"),
  openFileDialog: (options) => ipcRenderer.invoke("dialog:open", options),
  readFile: (filePath) => ipcRenderer.invoke("fs:read", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("fs:write", filePath, content),
  readdir: (dirPath) => ipcRenderer.invoke("fs:readdir", dirPath),
  readdirWithTypes: (dirPath) =>
    ipcRenderer.invoke("fs:readdirWithTypes", dirPath),
  watchDirectory: (dirPath) => ipcRenderer.invoke("workspace:watch", dirPath),
  refreshProjectRoots: () => ipcRenderer.invoke("projects:refresh-roots"),
  addProjectRoot: (directory) =>
    ipcRenderer.invoke("projects:add-root", directory),
  onWatch: (handler) => {
    const listener = (_event: IpcRendererEvent, data: WatchEvent) =>
      handler(data);
    ipcRenderer.on("file-changed", listener);
    return () => {
      ipcRenderer.removeListener("file-changed", listener);
    };
  },
};

contextBridge.exposeInMainWorld("electron", api);
export type { api };
