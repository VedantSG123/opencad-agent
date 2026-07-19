import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useEffect, useRef } from 'react'
import replicadTypes from 'virtual:replicad-types'

import { useTheme } from '@/contexts/theme-context'
import { type EditorMarker, useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import type { CadKernel } from '@/types/project'

import { usePanelContext } from '../../context/PanelContext'
import type { EditorAPI } from './context'
import { registerOpenSCAD } from './openscad/register'

// Register OpenSCAD language support in Monaco
registerOpenSCAD(monaco)

// Configure Monaco workers once at module level
window.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// Transparent theme variants — #RRGGBBAA, 66 alpha = ~66% opaque
monaco.editor.defineTheme('custom-vs-dark-transparent', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#1e1e1e66' },
})
monaco.editor.defineTheme('custom-vs-transparent', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#fffffe66' },
})

const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  scad: 'openscad',
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANGUAGE[ext] ?? 'plaintext'
}

interface MonacoEditorProps {
  path: string
  content: string | null
  isLoading: boolean
  openTabs: string[]
  kernel?: CadKernel
  onSave: (path: string, content: string) => Promise<void>
  onDirtyChange: (path: string, dirty: boolean) => void
  onExternalConflict: (path: string, externalContent: string) => void
  onRegisterAPI: (api: EditorAPI) => void
  onContentChange?: (path: string, content: string) => void
  onClearContent?: (path: string) => void
}

interface MonacoEditorBaseProps extends MonacoEditorProps {
  markers: EditorMarker[]
}

function MonacoEditorBase({
  path,
  content,
  isLoading,
  openTabs,
  kernel,
  markers,
  onSave,
  onDirtyChange,
  onExternalConflict,
  onRegisterAPI,
  onContentChange,
  onClearContent,
}: MonacoEditorBaseProps) {
  const { resolvedTheme } = useTheme()
  const { isFocusMode, focusedPanel } = usePanelContext()
  const isTransparent = isFocusMode && focusedPanel === 'editor'
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map())
  // Last content received from the server per path — the "clean" baseline
  const cleanContentRef = useRef<Map<string, string>>(new Map())
  // Active model's change listener
  const changeListenerRef = useRef<monaco.IDisposable | null>(null)
  // Stable refs for callbacks
  const onSaveRef = useRef(onSave)
  const onDirtyChangeRef = useRef(onDirtyChange)
  const onExternalConflictRef = useRef(onExternalConflict)
  const onRegisterAPIRef = useRef(onRegisterAPI)
  const onContentChangeRef = useRef(onContentChange)
  const onClearContentRef = useRef(onClearContent)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    onExternalConflictRef.current = onExternalConflict
  }, [onExternalConflict])
  useEffect(() => {
    onRegisterAPIRef.current = onRegisterAPI
  }, [onRegisterAPI])
  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])
  useEffect(() => {
    onClearContentRef.current = onClearContent
  }, [onClearContent])

  // ── Replicad autocomplete — configure Monaco JS/TS defaults with library types ──

  useEffect(() => {
    if (kernel !== 'replicad') return

    // Monaco's TypeScript language service API is not typed in the ESM d.ts
    // (it's contributed dynamically). We define a minimal interface and cast once.
    interface TSDefaults {
      setEagerModelSync(val: boolean): void
      setExtraLibs(libs: { content: string }[]): void
      setDiagnosticsOptions(opts: { diagnosticCodesToIgnore?: number[] }): void
    }
    const tsLang = (
      monaco.languages as unknown as {
        typescript: {
          javascriptDefaults: TSDefaults
          typescriptDefaults: TSDefaults
        }
      }
    ).typescript

    const extraLibs = [
      // Makes `import { ... } from 'replicad'` resolve in the language service
      { content: `declare module 'replicad' { ${replicadTypes} }` },
      // Also exposes `replicad` as a global for scripts that use the injected global
      {
        content: `import * as replicadAll from 'replicad';\ndeclare global {\n  declare var replicad: typeof replicadAll;\n}`,
      },
    ]
    const diagnosticsOptions = {
      // Suppress "Cannot find module" — replicad is injected at runtime, not bundled
      diagnosticCodesToIgnore: [2792],
    }

    tsLang.javascriptDefaults.setEagerModelSync(true)
    tsLang.javascriptDefaults.setExtraLibs(extraLibs)
    tsLang.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
    tsLang.typescriptDefaults.setEagerModelSync(true)
    tsLang.typescriptDefaults.setExtraLibs(extraLibs)
    tsLang.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

    return () => {
      tsLang.javascriptDefaults.setExtraLibs([])
      tsLang.typescriptDefaults.setExtraLibs([])
    }
  }, [kernel])

  // ── Register imperative API so the context can read/write models ───────────────

  useEffect(() => {
    const api: EditorAPI = {
      getContent: (p) => modelsRef.current.get(p)?.getValue() ?? null,
      applyContent: (p, newContent) => {
        const model = modelsRef.current.get(p)
        if (!model) return
        // Update clean baseline BEFORE setValue so the change listener sees no diff
        cleanContentRef.current.set(p, newContent)
        if (model.getValue() !== newContent) {
          const position = editorRef.current?.getPosition()
          model.setValue(newContent)
          if (position) editorRef.current?.setPosition(position)
        }
        onDirtyChangeRef.current(p, false)
      },
    }
    onRegisterAPIRef.current(api)
  }, [])

  // ── Create editor instance once ────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 22,
      fontFamily:
        '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
      fontLigatures: true,
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      padding: { top: 12, bottom: 12 },
      wordWrap: 'off',
      theme: 'vs-dark',
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const model = editor.getModel()
      if (!model) return
      const currentPath = [...modelsRef.current.entries()].find(
        ([, m]) => m === model,
      )?.[0]
      if (!currentPath) return
      const value = model.getValue()
      void onSaveRef.current(currentPath, value).then(() => {
        cleanContentRef.current.set(currentPath, value)
        onDirtyChangeRef.current(currentPath, false)
      })
    })

    editorRef.current = editor
    const models = modelsRef.current
    const cleanContent = cleanContentRef.current

    return () => {
      changeListenerRef.current?.dispose()
      editor.dispose()
      models.forEach((m) => m.dispose())
      models.clear()
      cleanContent.clear()
      editorRef.current = null
    }
  }, [])

  // ── Sync app theme → Monaco theme ─────────────────────────────────────────────

  useEffect(() => {
    if (isTransparent) {
      monaco.editor.setTheme(
        resolvedTheme === 'dark'
          ? 'custom-vs-dark-transparent'
          : 'custom-vs-transparent',
      )
    } else {
      monaco.editor.setTheme(resolvedTheme === 'dark' ? 'vs-dark' : 'vs')
    }
  }, [resolvedTheme, isTransparent])

  // ── Switch model and attach change listener when active path changes ───────────

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (!modelsRef.current.has(path)) {
      const model = monaco.editor.createModel('', detectLanguage(path))
      modelsRef.current.set(path, model)
    }

    const model = modelsRef.current.get(path)!
    editor.setModel(model)
    editor.focus()

    // Replace the change listener for the newly active model
    changeListenerRef.current?.dispose()
    changeListenerRef.current = model.onDidChangeContent(() => {
      const value = model.getValue()
      const clean = cleanContentRef.current.get(path) ?? ''
      onDirtyChangeRef.current(path, value !== clean)
      onContentChangeRef.current?.(path, value)
    })

    return () => {
      changeListenerRef.current?.dispose()
      changeListenerRef.current = null
    }
  }, [path])

  // ── Apply server content — detect dirty+external conflicts ─────────────────────

  useEffect(() => {
    if (content === null || isLoading) return
    const model = modelsRef.current.get(path)
    if (!model) return

    const previousClean = cleanContentRef.current.get(path)
    const hasBeenLoaded = previousClean !== undefined
    const contentChangedOnServer = hasBeenLoaded && content !== previousClean
    const hasDirtyEdits = hasBeenLoaded && model.getValue() !== previousClean

    if (contentChangedOnServer && hasDirtyEdits) {
      // Unsaved local edits + external server change → ask the user
      onExternalConflictRef.current(path, content)
      return
    }

    // Safe to apply: either first load, or file changed but no local edits
    cleanContentRef.current.set(path, content)
    if (model.getValue() !== content) {
      const position = editorRef.current?.getPosition()
      model.setValue(content)
      if (position) editorRef.current?.setPosition(position)
    }
    onDirtyChangeRef.current(path, false)
  }, [path, content, isLoading])

  // ── Sync OpenSCAD markers ──────────────────────────────────────────────────

  useEffect(() => {
    if (kernel !== 'openscad') return

    const models = modelsRef.current
    models.forEach((model, modelPath) => {
      const modelMarkers = markers
        .filter((marker) => {
          const markerFileNormalized = marker.file.startsWith('/')
            ? marker.file
            : `/${marker.file}`
          const modelPathNormalized = modelPath.startsWith('/')
            ? modelPath
            : `/${modelPath}`
          return modelPathNormalized === markerFileNormalized
        })
        .map((marker) => ({
          startLineNumber: marker.line,
          startColumn: 1,
          endLineNumber: marker.line,
          endColumn: 1000,
          message: marker.message,
          severity:
            marker.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
        }))

      monaco.editor.setModelMarkers(model, 'openscad', modelMarkers)
    })
  }, [markers, kernel])

  // ── Dispose models for closed tabs ─────────────────────────────────────────────

  useEffect(() => {
    const models = modelsRef.current
    const cleanContent = cleanContentRef.current
    models.forEach((model, tabPath) => {
      if (!openTabs.includes(tabPath)) {
        model.dispose()
        models.delete(tabPath)
        cleanContent.delete(tabPath)
        onDirtyChangeRef.current(tabPath, false)
        onClearContentRef.current?.(tabPath)
      }
    })
  }, [openTabs])

  return <div ref={containerRef} className='w-full h-full' />
}

function MonacoEditorWithMarkers(props: MonacoEditorProps) {
  const markers = useNodeOpenSCAD((state) => state.markers)
  return <MonacoEditorBase {...props} markers={markers} />
}

export function MonacoEditor(props: MonacoEditorProps) {
  if (props.kernel === 'openscad') {
    return <MonacoEditorWithMarkers {...props} />
  }
  return <MonacoEditorBase {...props} markers={[]} />
}
