import type * as monacoType from 'monaco-editor'

import { buildOpenSCADCompletionItemProvider } from './openscad-completions'
import openscadLanguage from './openscad-language'

export function registerOpenSCAD(monaco: typeof monacoType) {
  const registeredLangs = monaco.languages.getLanguages()
  if (registeredLangs.some((l) => l.id === 'openscad')) {
    return
  }

  monaco.languages.register({
    id: 'openscad',
    extensions: ['.scad'],
    mimetypes: ['text/openscad'],
  })

  const { conf, language } = openscadLanguage
  monaco.languages.setLanguageConfiguration('openscad', conf)
  monaco.languages.setMonarchTokensProvider('openscad', language)

  monaco.languages.registerCompletionItemProvider(
    'openscad',
    buildOpenSCADCompletionItemProvider(monaco),
  )
}
