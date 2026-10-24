import { libraryDirectory } from './directory'
import { installLibrary } from './install'
import { replicadLibrarySource } from './replicadSource' with { type: 'macro' }

const source = replicadLibrarySource()

export const replicadLibrary = {
  version: source.version,
  directory: libraryDirectory('replicad', source.version),
  install: () =>
    installLibrary(libraryDirectory('replicad', source.version), source.files),
}
