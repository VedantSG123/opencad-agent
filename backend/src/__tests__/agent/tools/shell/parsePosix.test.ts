import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

import {
  parsePosixCommand,
  posixSyntaxError,
  tokenizePosixCommand,
} from '../../../../agent/tools/shell/parse/posix'

const BASH_AVAILABLE =
  spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf-8' }).status === 0

const segments = (command: string): string[][] =>
  tokenizePosixCommand(command).segments

describe('tokenizePosixCommand', () => {
  test('splits a chain into one segment per command', () => {
    expect(segments('bun add zod && bun run build')).toEqual([
      ['bun', 'add', 'zod'],
      ['bun', 'run', 'build'],
    ])
    expect(segments('a; b')).toEqual([['a'], ['b']])
    expect(segments('a || b')).toEqual([['a'], ['b']])
    expect(segments('a | b')).toEqual([['a'], ['b']])
    expect(segments('a & b')).toEqual([['a'], ['b']])
  })

  // The whole point of parsing rather than string matching: a grant on the
  // first command must never be stretched over what follows it.
  test('exposes a command hidden behind a chain operator', () => {
    expect(segments('git status && rm -rf /')).toEqual([
      ['git', 'status'],
      ['rm', '-rf', '/'],
    ])
  })

  test('keeps a quoted operator inside its token', () => {
    expect(segments('echo "a && b"')).toEqual([['echo', 'a && b']])
    expect(segments("echo 'a; b'")).toEqual([['echo', 'a; b']])
  })

  test('strips the quotes around a program name', () => {
    expect(segments('"git" status')).toEqual([['git', 'status']])
    expect(segments("'git' status")).toEqual([['git', 'status']])
  })

  test('collapses runs of whitespace', () => {
    expect(segments('git   status')).toEqual([['git', 'status']])
  })

  test('keeps a glob in the position it was written', () => {
    expect(segments('ls *.ts')).toEqual([['ls', '*.ts']])
  })

  test('drops comments', () => {
    expect(segments('ls # everything')).toEqual([['ls']])
  })

  test('leaves an unexpanded variable visibly unexpanded', () => {
    expect(segments('echo $HOME')).toEqual([['echo', '$HOME']])
    expect(segments('echo ${HOME}')).toEqual([['echo', '$HOME']])
  })
})

describe('tokenizePosixCommand substitution', () => {
  test('reports a bare substitution', () => {
    console.log(tokenizePosixCommand('echo $(rm -rf /)'))
    expect(tokenizePosixCommand('echo $(rm -rf /)').sawSubstitution).toBe(true)
  })

  // shell-quote hands these back as ordinary word tokens, so nothing in its
  // operator stream would reveal them.
  test('reports a substitution buried in a token', () => {
    expect(tokenizePosixCommand('echo "$(rm -rf /)"').sawSubstitution).toBe(
      true,
    )
    expect(
      tokenizePosixCommand('git commit -m "$(whoami)"').sawSubstitution,
    ).toBe(true)
    expect(tokenizePosixCommand('echo "a$(b)c"').sawSubstitution).toBe(true)
  })

  test('reports backtick substitution', () => {
    expect(tokenizePosixCommand('echo `rm -rf /`').sawSubstitution).toBe(true)
    expect(tokenizePosixCommand('echo "`whoami`"').sawSubstitution).toBe(true)
  })

  test('reports process substitution', () => {
    expect(tokenizePosixCommand('diff <(a) <(b)').sawSubstitution).toBe(true)
  })

  test('stays quiet when there is none', () => {
    expect(tokenizePosixCommand('bun add zod').sawSubstitution).toBe(false)
    expect(tokenizePosixCommand('echo $HOME').sawSubstitution).toBe(false)
  })
})

describe('tokenizePosixCommand redirection', () => {
  test('reports every redirection form', () => {
    expect(tokenizePosixCommand('cat a > b').sawRedirection).toBe(true)
    expect(tokenizePosixCommand('cat a >> b').sawRedirection).toBe(true)
    expect(tokenizePosixCommand('cat < a').sawRedirection).toBe(true)
    expect(tokenizePosixCommand('cmd 2>&1').sawRedirection).toBe(true)
    expect(tokenizePosixCommand('cat <<EOF').sawRedirection).toBe(true)
  })

  test('stays quiet when there is none', () => {
    expect(tokenizePosixCommand('bun add zod').sawRedirection).toBe(false)
  })

  test('does not mistake a quoted angle bracket for redirection', () => {
    expect(tokenizePosixCommand('echo "a > b"').sawRedirection).toBe(false)
  })
})

describe('tokenizePosixCommand faithfulness', () => {
  test('trusts an ordinary command', () => {
    expect(tokenizePosixCommand('bun add zod').tokensAreFaithful).toBe(true)
    expect(tokenizePosixCommand('cat a > b').tokensAreFaithful).toBe(true)
    expect(tokenizePosixCommand('cat <<<hello').tokensAreFaithful).toBe(true)
  })

  // shell-quote knows nothing about heredocs, so it tokenizes the body as
  // though it were shell - inventing segments that no shell will ever run.
  test('distrusts a heredoc', () => {
    const heredoc = `cat <<'PY'
import os; os.system('rm -rf /')
PY`

    const parsed = tokenizePosixCommand(heredoc)

    expect(parsed.tokensAreFaithful).toBe(false)
  })

  // The leading token is the assignment, not the program, so a rule minted
  // from it would name something that is never run.
  test('distrusts an assignment in command position', () => {
    expect(
      tokenizePosixCommand('PATH=/tmp/evil:$PATH cat notes.txt')
        .tokensAreFaithful,
    ).toBe(false)
  })

  test('distrusts an assignment in any segment of a chain', () => {
    expect(
      tokenizePosixCommand('ls && PATH=/tmp/evil cat notes.txt')
        .tokensAreFaithful,
    ).toBe(false)
  })

  test('does not mistake an argument containing = for an assignment', () => {
    expect(tokenizePosixCommand('make CC=gcc').tokensAreFaithful).toBe(true)
    expect(
      tokenizePosixCommand('./configure --prefix=/usr').tokensAreFaithful,
    ).toBe(true)
  })
})

describe('posixSyntaxError', () => {
  test.skipIf(!BASH_AVAILABLE)('accepts valid syntax', () => {
    expect(posixSyntaxError('echo foo')).toBeNull()
    expect(posixSyntaxError('git status && rm -rf /')).toBeNull()
    expect(posixSyntaxError('echo $(whoami)')).toBeNull()
  })

  test.skipIf(!BASH_AVAILABLE)('rejects what shell-quote would accept', () => {
    expect(tokenizePosixCommand("echo 'foo").segments).toEqual([
      ['echo', 'foo'],
    ])
    expect(posixSyntaxError("echo 'foo")).not.toBeNull()
    expect(posixSyntaxError('echo "foo')).not.toBeNull()
    expect(posixSyntaxError('echo )')).not.toBeNull()
  })
})

describe('parsePosixCommand', () => {
  test('refuses an empty command', () => {
    expect(parsePosixCommand('')).toEqual({
      ok: false,
      reason: 'The command is empty.',
    })
    expect(parsePosixCommand('   ').ok).toBe(false)
  })

  test.skipIf(!BASH_AVAILABLE)('refuses malformed syntax', () => {
    expect(parsePosixCommand("echo 'foo").ok).toBe(false)
  })

  test.skipIf(!BASH_AVAILABLE)('parses a well-formed chain', () => {
    const result = parsePosixCommand('bun add zod && bun run build')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.segments).toEqual([
      ['bun', 'add', 'zod'],
      ['bun', 'run', 'build'],
    ])
    expect(result.parsed.sawSubstitution).toBe(false)
    expect(result.parsed.sawRedirection).toBe(false)
    expect(result.parsed.tokensAreFaithful).toBe(true)
  })
})
