// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as monaco from 'monaco-editor'

import { kernelFilesStore } from '@/hooks/useKernelFiles'

import builtinSignatures from './openscad-builtins'
import openscadLanguage from './openscad-language'
import {
  type ParsedFile,
  type ParsedFunctionoidDef,
  parseOpenSCAD,
  stripComments,
} from './openscad-pseudoparser'

function mapObject<T, U>(
  obj: Record<string, T>,
  fn: (key: string, value: T) => U,
  filter?: (key: string, value: T) => boolean,
): U[] {
  const result: U[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (!filter || filter(k, v)) {
      result.push(fn(k, v))
    }
  }
  return result
}

function makeFunctionoidSuggestion(
  monacoInstance: typeof monaco,
  name: string,
  mod: ParsedFunctionoidDef,
  range: monaco.IRange,
): monaco.languages.CompletionItem {
  const argSnippets: string[] = []
  const namedArgs: string[] = []
  let collectingPosArgs = true
  let i = 0
  for (const param of mod.params ?? []) {
    if (collectingPosArgs) {
      if (param.defaultValue != null) {
        collectingPosArgs = false
      } else {
        argSnippets.push(
          `${param.name.replaceAll('$', '\\$')}=${'${' + ++i + ':' + param.name + '}'}`,
        )
        continue
      }
    }
    namedArgs.push(param.name)
  }
  if (namedArgs.length) {
    argSnippets.push(`${'${' + ++i + ':' + namedArgs.join('|') + '=}'}`)
  }
  let insertText = `${name.replaceAll('$', '\\$')}(${argSnippets.join(', ')})`
  if (mod.referencesChildren !== null) {
    insertText += mod.referencesChildren ? ' ${' + (i + 1) + ':children}' : ';'
  }
  return {
    label: mod.signature,
    kind: monacoInstance.languages.CompletionItemKind.Function,
    insertText,
    insertTextRules:
      monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
  }
}

const getBuiltinCompletions = (
  monacoInstance: typeof monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] => {
  const keywords = (openscadLanguage.language.keywords as string[]) || []
  return [
    ...[true, false].map((v) => ({
      label: `${v}`,
      kind: monacoInstance.languages.CompletionItemKind.Value,
      insertText: `${v}`,
      insertTextRules:
        monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    })),
    ...keywords.map((v: string) => ({
      label: v,
      kind: monacoInstance.languages.CompletionItemKind.Function,
      insertText: v,
      insertTextRules:
        monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    })),
  ]
}

const keywordSnippets = [
  'for(${1:variable}=[${2:start}:${3:end}) ${4:body}',
  'for(${1:variable}=[${2:start}:${3:increment}:${4:end}) ${5:body}',
  'if (${1:condition}) {\n\t$0\n} else {\n\t\n}',
]

function cleanupVariables(snippet: string) {
  return snippet
    .replaceAll(/\$\{\d+:([$\w]+)\}/g, '$1')
    .replaceAll(/\$\d+/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

export function buildOpenSCADCompletionItemProvider(
  monacoInstance: typeof monaco,
): monaco.languages.CompletionItemProvider {
  const parsedFiles: { [path: string]: Promise<ParsedFile> | undefined } = {}

  function readFile(path: string): Promise<string> {
    const files = kernelFilesStore.getState().files
    const normalized = path.replace(/^\.\//, '')
    const options = [
      path,
      normalized,
      '/' + normalized,
      normalized.startsWith('/') ? normalized.substring(1) : '/' + normalized,
    ]
    for (const opt of options) {
      if (files[opt]) {
        return Promise.resolve(files[opt].content)
      }
    }
    return Promise.resolve('')
  }

  const builtinsPath = '<builtins>'
  let builtinsDefs: ParsedFile

  function getParsed(
    path: string,
    src: string | null,
    {
      skipPrivates,
      addBuiltins,
    }: { skipPrivates: boolean; addBuiltins: boolean },
  ): Promise<ParsedFile> {
    if (parsedFiles[path]) return parsedFiles[path]

    const parsePromise = (async () => {
      let content = src
      if (content == null) {
        content = await readFile(path)
      }
      const result: ParsedFile = {
        functions: {},
        modules: {},
        vars: [],
        includes: [],
        uses: [],
      }

      const mergeDefinitions = (isUse: boolean, defs: ParsedFile) => {
        result.functions = { ...result.functions, ...defs.functions }
        result.modules = { ...result.modules, ...defs.modules }
        if (!isUse) {
          result.vars = [...result.vars, ...defs.vars]
        }
      }
      const dir = (path.split('/').slice(0, -1).join('/') || '.') + '/'

      const handleInclude = async (isUse: boolean, otherPath: string) => {
        let found = false
        for (const option of [`${dir}${otherPath}`, otherPath]) {
          try {
            const otherSrc = await readFile(option)
            if (!otherSrc) continue
            const sub = await getParsed(otherPath, otherSrc, {
              skipPrivates: true,
              addBuiltins: false,
            })
            mergeDefinitions(isUse, sub)
            found = true
            break
          } catch (e) {
            console.warn(
              `Failed to read file option ${option} for ${otherPath} ${isUse ? 'used' : 'included'} by ${path}`,
              e,
            )
          }
        }
        if (!found) {
          console.error(
            'Failed to find ',
            otherPath,
            '(context imported in ',
            path,
            ')',
          )
        }
      }

      if (addBuiltins && path !== builtinsPath) {
        mergeDefinitions(false, builtinsDefs)
      }

      const ownDefs = parseOpenSCAD(path, content, skipPrivates)

      await Promise.all(
        [
          ...(ownDefs.uses ?? []).map((p) => [p, true] as [string, boolean]),
          ...(ownDefs.includes ?? []).map(
            (p) => [p, false] as [string, boolean],
          ),
        ].map(([otherPath, isUse]) => handleInclude(isUse, otherPath)),
      )

      mergeDefinitions(false, ownDefs)
      return result
    })()

    parsedFiles[path] = parsePromise
    return parsePromise
  }

  // Initialize builtins defs asynchronously but ensure it runs
  void getParsed(builtinsPath, builtinSignatures, {
    skipPrivates: false,
    addBuiltins: false,
  }).then((defs) => {
    builtinsDefs = defs
  })

  return {
    triggerCharacters: ['<', '/'],
    provideCompletionItems: async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): Promise<monaco.languages.CompletionList> => {
      try {
        const { word } = model.getWordUntilPosition(position)
        const offset = model.getOffsetAt(position)
        const text = model.getValue()
        let previous = text.substring(0, offset)
        const lastNewLine = previous.lastIndexOf('\n')
        previous = previous.substring(lastNewLine + 1)

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - word.length,
          endColumn: position.column,
        }

        const includeMatch = /\b(include|use)\s*<([^<>\n"]*)$/.exec(previous)
        if (includeMatch) {
          const prefix = includeMatch[2]
          let filePrefix
          const lastSlash = prefix.lastIndexOf('/')
          if (lastSlash < 0) {
            filePrefix = prefix
          } else {
            filePrefix = prefix.substring(lastSlash + 1)
          }
          const suggestions: monaco.languages.CompletionItem[] = []

          // List options from the in-memory kernelFilesStore files list
          const files = Object.keys(kernelFilesStore.getState().files)
          for (const file of files) {
            const fileName = file.split('/').pop() ?? ''
            if (filePrefix !== '' && !fileName.startsWith(filePrefix)) {
              continue
            }
            if (file.endsWith('.scad')) {
              suggestions.push({
                label: fileName,
                kind: monacoInstance.languages.CompletionItemKind.File,
                insertText: fileName + '>\n',
                range,
              })
            }
          }
          suggestions.sort((a, b) =>
            (a.label as string).localeCompare(b.label as string),
          )
          return { suggestions }
        }

        const currentPath = model.uri.path
        delete parsedFiles[currentPath]

        // Ensure builtinsDefs is ready before running getParsed
        if (!builtinsDefs) {
          builtinsDefs = await getParsed(builtinsPath, builtinSignatures, {
            skipPrivates: false,
            addBuiltins: false,
          })
        }

        const parsed = await getParsed(currentPath, text, {
          skipPrivates: false,
          addBuiltins: true,
        })

        const previousWithoutComments = stripComments(previous)
        const statementMatch = /(^|.*?[{});]|>\s*\n)\s*([$\w]*)$/m.exec(
          previousWithoutComments,
        )
        if (statementMatch) {
          const start = statementMatch[1]
          const suggestions: monaco.languages.CompletionItem[] = [
            ...getBuiltinCompletions(monacoInstance, range),
            ...mapObject(
              parsed.modules ?? {},
              (name, mod) =>
                makeFunctionoidSuggestion(monacoInstance, name, mod, range),
              (name) => name.indexOf(word) >= 0,
            ),
            ...(parsed.vars ?? [])
              .filter((name) => name.indexOf(word) >= 0)
              .map((name) => ({
                label: name,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                insertText: name.replaceAll('$', '\\$'),
                insertTextRules:
                  monacoInstance.languages.CompletionItemInsertTextRule
                    .InsertAsSnippet,
                range,
              })),
            ...keywordSnippets.map((snippet) => ({
              label: cleanupVariables(snippet).replaceAll(/ body/g, ''),
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: snippet,
              insertTextRules:
                monacoInstance.languages.CompletionItemInsertTextRule
                  .InsertAsSnippet,
              range,
            })),
          ]
          suggestions.sort(
            (a, b) => a.insertText.indexOf(start) - b.insertText.indexOf(start),
          )
          return { suggestions }
        }

        const named = [
          ...mapObject(
            parsed.functions ?? {},
            (name, mod) =>
              [
                name,
                makeFunctionoidSuggestion(monacoInstance, name, mod, range),
              ] as [string, monaco.languages.CompletionItem],
            (name) => name.indexOf(word) >= 0,
          ),
        ]
        named.sort(([a], [b]) => a.indexOf(word) - b.indexOf(word))

        const suggestions = named.map(([, s]) => s)
        return { suggestions }
      } catch (e) {
        console.error(e)
        return { suggestions: [] }
      }
    },
  }
}
