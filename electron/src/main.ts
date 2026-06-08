import { spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ReturnType<typeof spawn> | null = null;

function getBackendDir() {
  let backendDir = path.resolve(__dirname, "../backend");
  if (!fs.existsSync(backendDir)) {
    backendDir = path.resolve(__dirname, "../../backend");
  }
  return backendDir;
}

function startBackend() {
  const backendDir = getBackendDir();
  console.log(`Starting Elysia backend in directory: ${backendDir}`);

  backendProcess = spawn("bun", ["run", "src/index.ts"], {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err);
  });

  backendProcess.on("exit", (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  // In development, load the Vite dev server URL.
  // In production, we would load the built dist/index.html.
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173").catch((err) => {
      console.error("Failed to load URL:", err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow
      .loadFile(path.join(__dirname, "../frontend/dist/index.html"))
      .catch((err) => {
        console.error("Failed to load static file:", err);
      });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle("ping-backend", async () => {
  try {
    const res = await fetch("http://localhost:3000/");
    const text = await res.text();
    return `Main Process Response: SUCCESS (Elysia Backend says: "${text}")`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return `Main Process Response: FAILED (Could not connect to Elysia on port 3000. Error: ${msg})`;
  }
});

ipcMain.handle(
  "open-file-dialog",
  async (
    _event,
    options: { mode: "file" | "directory"; extension?: string },
  ) => {
    const isFile = options.mode === "file";
    const properties: ("openFile" | "openDirectory")[] = isFile
      ? ["openFile"]
      : ["openDirectory"];

    const result = await dialog.showOpenDialog({
      properties,
      filters:
        isFile && options.extension
          ? [{ name: "CAD Files", extensions: [options.extension] }]
          : undefined,
    });

    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  },
);

ipcMain.handle("read-file", async (_event, filePath: string) => {
  return fs.promises.readFile(filePath, "utf-8");
});

ipcMain.handle(
  "write-file",
  async (_event, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, "utf-8");
  },
);

ipcMain.handle("readdir", async (_event, dirPath: string) => {
  return fs.promises.readdir(dirPath);
});

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (backendProcess) {
    console.log("Killing backend process...");
    backendProcess.kill();
  }
});
