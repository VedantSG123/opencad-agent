export const API_DOC_ENTITY_TYPES = [
  'class',
  'function',
  'variable',
  'interface',
  'type-alias',
] as const

export const API_DOC_CHUNK_ENTITY_TYPES = [
  ...API_DOC_ENTITY_TYPES,
  'method',
] as const

export type ApiDocEntityType = (typeof API_DOC_ENTITY_TYPES)[number]

export type ApiDocChunkEntityType = (typeof API_DOC_CHUNK_ENTITY_TYPES)[number]

export interface ApiDocChunk {
  id: string // e.g. class:CompSolid or method:CompSolid.blobSTL
  type: ApiDocChunkEntityType
  name: string // e.g. CompSolid or blobSTL
  content: string // The markdown content
  metadata?: Record<string, string>
}

const cleanApiDocumentation = (doc: string) => {
  const lines = doc.split('\n')
  const filteredLines = lines.filter((line) => !line.startsWith('Defined in:'))
  return filteredLines.join('\n')
}

/**
 * Splits markdown content by a specific header level (e.g., "## ").
 * Returns an array where the first element is the content before the first header,
 * and subsequent elements start with the header.
 */
const splitByHeader = (content: string, level: number): string[] => {
  const chunks: string[] = []

  const matches = []
  const re = new RegExp(`^#{${level}} .*`, 'gm')

  let match
  while ((match = re.exec(content)) !== null) {
    matches.push({ index: match.index, text: match[0] })
  }

  if (matches.length === 0) {
    // Return the whole content as one chunk if no headers found
    // But we should verify if we want to treat it as preamble or what.
    // Usually calls to this expect splittable content.
    return [content]
  }

  // Content before first header
  if (matches[0].index > 0) {
    chunks.push(content.substring(0, matches[0].index))
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i < matches.length - 1 ? matches[i + 1].index : content.length
    chunks.push(content.substring(start, end))
  }

  return chunks
}

const extractHeaderTitle = (headerLine: string): string => {
  // Remove leading hashes and whitespace
  return headerLine.replace(/^#+\s+/, '').trim()
}

const chunkClassDoc = (doc: string, className: string): ApiDocChunk[] => {
  const cleanedDoc = cleanApiDocumentation(doc)
  const sections = splitByHeader(cleanedDoc, 2)

  const mainSectionKeywords = [
    'Extends',
    'Implements',
    'Constructors',
    'Constructor',
    'Properties',
    'Index',
  ]

  const mainChunkParts: string[] = []
  const methods: ApiDocChunk[] = []
  const methodNames: string[] = []

  const isPreamble = !sections[0].trim().startsWith('## ')

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const trimmed = section.trim()

    if (!trimmed) continue

    if (i === 0 && isPreamble) {
      mainChunkParts.push(section)
      continue
    }

    const titleLine = section.split('\n')[0]
    const title = extractHeaderTitle(titleLine)

    if (mainSectionKeywords.some((k) => title.startsWith(k))) {
      mainChunkParts.push(section)
    } else {
      const subSections = splitByHeader(section, 3)

      for (const sub of subSections) {
        if (sub.trim().startsWith('### ')) {
          const subTitleLine = sub.split('\n')[0]
          const rawName = extractHeaderTitle(subTitleLine)

          let methodName = rawName
            .replace(/\(.*\)$/, '')
            .replace(/<.*>$/, '')
            .trim()
          if (methodName.startsWith('get '))
            methodName = methodName.substring(4)
          if (methodName.startsWith('set '))
            methodName = methodName.substring(4)

          const methodId = `method:${className}.${methodName}`

          methods.push({
            id: methodId,
            type: 'method',
            name: methodName,
            content: sub,
            metadata: {
              parent: className,
            },
          })
          if (!methodNames.includes(methodName)) {
            methodNames.push(methodName)
          }
        }
      }
    }
  }

  if (methodNames.length > 0) {
    mainChunkParts.push(
      `\n## Methods Summary\n\nThe following methods are available in this class:\n\n${methodNames.map((m) => `- ${m}`).join('\n')}\n`,
    )
  }

  const mainChunk: ApiDocChunk = {
    id: `class:${className}`,
    type: 'class',
    name: className,
    content: mainChunkParts.join('\n'),
  }

  return [mainChunk, ...methods]
}

const chunkSimpleDoc = (
  doc: string,
  entityType: ApiDocEntityType,
  name: string,
): ApiDocChunk[] => {
  return [
    {
      id: `${entityType}:${name}`,
      type: entityType,
      name: name,
      content: cleanApiDocumentation(doc),
    },
  ]
}

export const generateApiDocsChunks = (
  docContent: string,
  entityType: ApiDocEntityType,
  entityName: string,
): ApiDocChunk[] => {
  if (entityType === 'class') {
    return chunkClassDoc(docContent, entityName)
  } else {
    return chunkSimpleDoc(docContent, entityType, entityName)
  }
}
