import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

const components: Components = {
  p: ({ children }) => <p className='my-2 first:mt-0 last:mb-0'>{children}</p>,
  ul: ({ children }) => <ul className='my-2 list-disc pl-5'>{children}</ul>,
  ol: ({ children }) => <ol className='my-2 list-decimal pl-5'>{children}</ol>,
  li: ({ children }) => <li className='my-0.5'>{children}</li>,
  h1: ({ children }) => (
    <h3 className='mt-3 mb-1 text-sm font-semibold'>{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className='mt-3 mb-1 text-sm font-semibold'>{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className='mt-3 mb-1 text-sm font-semibold'>{children}</h4>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className='text-accent underline underline-offset-2'
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className='my-2 overflow-x-auto rounded-lg bg-muted/15 p-2 text-xs leading-relaxed'>
      {children}
    </pre>
  ),
  code: ({ children, className }) =>
    // A language class means a fenced block, which `pre` already frames.
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className='rounded bg-muted/20 px-1 py-0.5 text-[0.85em]'>
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div className='my-2 overflow-x-auto'>
      <table className='text-xs'>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className='border-b border-border px-2 py-1 text-left font-semibold'>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className='border-b border-border/50 px-2 py-1'>{children}</td>
  ),
}

export function Markdown({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-foreground wrap-break-word',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
