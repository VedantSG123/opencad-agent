import { afterAll, describe, expect, test } from 'bun:test'

import {
  findPowerShell,
  parsePowerShellCommand,
  shutdownPowerShellParsers,
} from '../../../../agent/tools/shell/parse/powershell'

const POWERSHELL_AVAILABLE = findPowerShell() !== null

afterAll(() => {
  shutdownPowerShellParsers()
})

const segmentsOf = async (command: string): Promise<string[][]> => {
  const result = await parsePowerShellCommand(command)
  if (!result.ok) throw new Error(`expected a parse, got: ${result.reason}`)
  return result.parsed.segments
}

describe.skipIf(!POWERSHELL_AVAILABLE)('parsePowerShellCommand', () => {
  test('lowers a plain command to words', async () => {
    expect(await segmentsOf('git status')).toEqual([['git', 'status']])
    expect(await segmentsOf('bun add zod')).toEqual([['bun', 'add', 'zod']])
  })

  test('keeps a parameter and its argument as separate words', async () => {
    expect(await segmentsOf('Get-ChildItem -Path . -Recurse')).toEqual([
      ['Get-ChildItem', '-Path', '.', '-Recurse'],
    ])
  })

  // The whole point of parsing: a grant on the first command must never be
  // stretched over what follows it.
  test('exposes a command hidden behind a separator', async () => {
    expect(
      await segmentsOf('git status; Remove-Item -Recurse -Force build'),
    ).toEqual([
      ['git', 'status'],
      ['Remove-Item', '-Recurse', '-Force', 'build'],
    ])
  })

  test('splits a pipeline chain', async () => {
    expect(await segmentsOf('git status && bun run build')).toEqual([
      ['git', 'status'],
      ['bun', 'run', 'build'],
    ])
  })

  test('splits a pipeline', async () => {
    expect(await segmentsOf('Get-Content foo.txt | Select-String bar')).toEqual(
      [
        ['Get-Content', 'foo.txt'],
        ['Select-String', 'bar'],
      ],
    )
  })

  // Backslash is an ordinary character in PowerShell, not an escape, so a
  // bash-shaped tokenizer would mangle every Windows path.
  test('keeps Windows paths intact', async () => {
    expect(await segmentsOf(String.raw`Remove-Item C:\temp\x.txt`)).toEqual([
      ['Remove-Item', String.raw`C:\temp\x.txt`],
    ])
    expect(
      await segmentsOf(String.raw`Get-ChildItem -Path "C:\Users\vedan\temp"`),
    ).toEqual([['Get-ChildItem', '-Path', String.raw`C:\Users\vedan\temp`]])
  })

  test('keeps a quoted separator inside its word', async () => {
    expect(await segmentsOf(String.raw`echo "a && b"`)).toEqual([
      ['echo', 'a && b'],
    ])
    expect(await segmentsOf(String.raw`echo 'a; b'`)).toEqual([
      ['echo', 'a; b'],
    ])
  })

  // PowerShell binds ',' tighter than '+', so building the flag and its value
  // as "'-' + $name, $value" fuses them into one word instead of two.
  test('splits a colon-form parameter into flag and value', async () => {
    expect(await segmentsOf(String.raw`Get-ChildItem -Path:C:\data`)).toEqual([
      ['Get-ChildItem', '-Path', String.raw`C:\data`],
    ])
  })

  test('normalises both parameter spellings to the same words', async () => {
    expect(await segmentsOf(String.raw`Get-ChildItem -Path:C:\data`)).toEqual(
      await segmentsOf(String.raw`Get-ChildItem -Path C:\data`),
    )
  })

  test('keeps a valueless switch as a single word', async () => {
    expect(await segmentsOf('Get-ChildItem -Recurse')).toEqual([
      ['Get-ChildItem', '-Recurse'],
    ])
  })

  test('splits a chain of more than two commands', async () => {
    expect(
      await segmentsOf('git status && bun run build || echo fail'),
    ).toEqual([
      ['git', 'status'],
      ['bun', 'run', 'build'],
      ['echo', 'fail'],
    ])
  })

  test('splits on newlines as well as separators', async () => {
    expect(await segmentsOf('git status\nRemove-Item -Recurse build')).toEqual([
      ['git', 'status'],
      ['Remove-Item', '-Recurse', 'build'],
    ])
  })

  // Single quotes are literal in PowerShell, and the AST reflects that, so
  // this is not reported as substitution the way the POSIX side must.
  test('does not mistake a single-quoted subexpression for substitution', async () => {
    const result = await parsePowerShellCommand(String.raw`echo '$(whoami)'`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.sawSubstitution).toBe(false)
    expect(result.parsed.segments).toEqual([['echo', '$(whoami)']])
  })

  test('reports every redirection form the parser accepts', async () => {
    const redirects = async (command: string): Promise<boolean> => {
      const result = await parsePowerShellCommand(command)
      if (!result.ok) throw new Error(`expected a parse, got: ${result.reason}`)
      return result.parsed.sawRedirection
    }

    expect(await redirects('Get-Content a > b')).toBe(true)
    expect(await redirects('Get-Content a >> b')).toBe(true)
    expect(await redirects('cmd 2>&1')).toBe(true)
    expect(await redirects('cmd *> o.txt')).toBe(true)
    expect(await redirects('git status')).toBe(false)
  })

  test('treats anything it lowers as faithful', async () => {
    const result = await parsePowerShellCommand('git status')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.tokensAreFaithful).toBe(true)
  })
})

describe.skipIf(!POWERSHELL_AVAILABLE)(
  'parsePowerShellCommand refusals',
  () => {
    const refuses = async (command: string): Promise<string> => {
      const result = await parsePowerShellCommand(command)
      if (result.ok) throw new Error(`expected a refusal for: ${command}`)
      return result.reason
    }

    // Only literal words are lowered; a variable could stand for anything at
    // runtime, so the command runs but can never mint a rule.
    test('refuses a command carrying a variable', async () => {
      expect(await refuses('Get-ChildItem $path')).toContain('constructs')
    })

    test('refuses a subexpression', async () => {
      expect(await refuses('echo $(whoami)')).toContain('constructs')
      expect(await refuses('echo @(1, 2)')).toContain('constructs')
    })

    test('refuses a script block', async () => {
      expect(await refuses('if ($true) { Remove-Item x }')).toContain(
        'constructs',
      )
    })

    // Everything after --% is handed to the native command verbatim, so the AST
    // shape stops describing what actually runs.
    test('refuses the stop-parsing marker', async () => {
      expect(await refuses('git status --%')).toContain('constructs')
    })

    // PowerShell rejects '<' outright - "reserved for future use" - so it never
    // reaches the redirection check.
    test('refuses the reserved input redirection operator', async () => {
      expect(await refuses('Get-Content < a')).toContain('not valid PowerShell')
    })

    test('refuses splatting and literal collections', async () => {
      expect(await refuses('Get-ChildItem @args')).toContain('constructs')
      expect(await refuses('echo @{ a = 1 }')).toContain('constructs')
    })

    test('refuses an assignment, even alongside a real command', async () => {
      expect(await refuses('$x = 1')).toContain('constructs')
      expect(await refuses('$x = 1; Remove-Item build')).toContain('constructs')
    })

    test('refuses the invocation and dot-source operators', async () => {
      expect(
        await refuses(String.raw`& 'C:\Windows\System32\cmd.exe' /c dir`),
      ).toContain('constructs')
    })

    test('refuses a trap, which runs code the words do not name', async () => {
      expect(await refuses('trap { echo x } git status')).toContain(
        'constructs',
      )
    })

    test('refuses explicitly named blocks', async () => {
      expect(await refuses('begin { git status }')).toContain('constructs')
      expect(await refuses('param($x) git status')).toContain('constructs')
      expect(await refuses('using namespace System; git status')).toContain(
        'constructs',
      )
    })

    test('refuses input that runs nothing', async () => {
      expect(await refuses('# just a comment')).toContain('nothing to run')
    })

    test('refuses invalid syntax', async () => {
      expect(await refuses('Remove-Item ) (')).toContain('not valid PowerShell')
    })

    test('refuses an empty command', async () => {
      expect(await refuses('   ')).toContain('empty')
    })
  },
)
