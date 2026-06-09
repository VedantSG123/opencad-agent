import { spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ReturnType<typeof spawn> | null = null;
let backendPort = 3000;

function findFreePort(startPort: number = 3000): Promise<number> {
  return new Promise((resolve) => {
    const checkPort = (port: number) => {
      const server = net.createServer();
      server.once("error", (err: unknown) => {
        const error = err as { code?: string };
        if (error.code === "EADDRINUSE") {
          checkPort(port + 1);
        } else {
          checkPort(port + 1);
        }
      });

      server.once("listening", () => {
        server.close(() => {
          resolve(port);
        });
      });

      server.listen(port, "127.0.0.1");
    };

    checkPort(startPort);
  });
}

function getBackendDir() {
  let backendDir = path.resolve(__dirname, "../backend");
  if (!fs.existsSync(backendDir)) {
    backendDir = path.resolve(__dirname, "../../backend");
  }
  return backendDir;
}

function startBackend(port: number) {
  let binPath: string;
  let args: string[];
  let cwdPath: string;

  if (app.isPackaged) {
    // In production, the backend-api binary and migrations are placed in the resources directory
    binPath = path.join(process.resourcesPath, "bin", "backend-api");
    cwdPath = path.join(process.resourcesPath, "bin");
    args = [];
  } else {
    // In development, spawn bun to run src/index.ts
    binPath = "bun";
    cwdPath = getBackendDir();
    args = ["run", "src/index.ts"];
  }

  console.log(
    `Starting Elysia backend on port ${port}. Executable: ${binPath}`,
  );

  backendProcess = spawn(binPath, args, {
    cwd: cwdPath,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? "production" : "development",
      PORT: String(port),
    },
  });

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err);
  });

  backendProcess.on("exit", (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--backend-port=${port}`],
    },
    autoHideMenuBar: true,
  });

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173").catch((err) => {
      console.error("Failed to load URL:", err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow
      .loadFile(path.join(process.resourcesPath, "frontend", "index.html"))
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
    const res = await fetch(`http://127.0.0.1:${backendPort}/`);
    const text = await res.text();
    return `Main Process Response: SUCCESS (Elysia Backend says: "${text}")`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return `Main Process Response: FAILED (Could not connect to Elysia on port ${backendPort}. Error: ${msg})`;
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

app.whenReady().then(async () => {
  backendPort = await findFreePort(3000);
  startBackend(backendPort);
  createWindow(backendPort);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(backendPort);
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
