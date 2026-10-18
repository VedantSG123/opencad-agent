import { describe, expect, test } from 'bun:test'

import { dangerousCommandReason } from '../../../agent/permissions/builtin/dangerousCommands'
import { isOpaqueHead } from '../../../agent/permissions/builtin/opaqueCommands'
import { isKnownSafeCommand } from '../../../agent/permissions/builtin/safeCommands'

const words = (command: string): string[] => command.split(' ')

const dangerous = (command: string): boolean =>
  dangerousCommandReason(words(command)) !== null

const safe = (command: string): boolean => isKnownSafeCommand(words(command))

describe('dangerousCommandReason', () => {
  test('flags removal that recurses or skips prompting', () => {
    expect(dangerous('rm -rf build')).toBe(true)
    expect(dangerous('rm -r build')).toBe(true)
    expect(dangerous('rm -fr build')).toBe(true)
    expect(dangerous('rm -f notes.txt')).toBe(true)
    expect(dangerous('rm notes.txt')).toBe(false)
  })

  test('flags the PowerShell spelling too', () => {
    expect(dangerous('Remove-Item -Recurse build')).toBe(true)
    expect(dangerous('remove-item -force x')).toBe(true)
    expect(dangerous('Remove-Item notes.txt')).toBe(false)
  })

  // A stored rule for `git` must never quietly cover these.
  test('flags the git operations that discard work', () => {
    expect(dangerous('git push --force origin main')).toBe(true)
    expect(dangerous('git push -f')).toBe(true)
    expect(dangerous('git reset --hard HEAD~1')).toBe(true)
    expect(dangerous('git clean -fd')).toBe(true)
    expect(dangerous('git filter-branch --all')).toBe(true)
    expect(dangerous('git push origin main')).toBe(false)
    expect(dangerous('git status')).toBe(false)
  })

  test('reads a git subcommand past its global flags', () => {
    expect(dangerous('git -C /tmp push --force')).toBe(true)
  })

  test('flags whole-disk and machine-level tools by name', () => {
    expect(dangerous('dd if=/dev/zero of=/dev/sda')).toBe(true)
    expect(dangerous('mkfs /dev/sda1')).toBe(true)
    expect(dangerous('shutdown -h now')).toBe(true)
    expect(dangerous('Format-Volume -DriveLetter D')).toBe(true)
  })

  // Classification looks through the path and the case, because the damage
  // does not depend on how the program was spelled.
  test('sees through a qualified path and casing', () => {
    expect(dangerous('/bin/rm -rf /')).toBe(true)
    expect(dangerous('C:/Windows/System32/shutdown.exe /s')).toBe(true)
    expect(dangerous('DD if=/dev/zero')).toBe(true)
  })

  test('flags sweeping permission changes', () => {
    expect(dangerous('chmod -R 777 .')).toBe(true)
    expect(dangerous('chmod 777 x.sh')).toBe(true)
    expect(dangerous('chmod +x script.sh')).toBe(false)
  })

  test('leaves ordinary commands alone', () => {
    expect(dangerous('bun add zod')).toBe(false)
    expect(dangerous('ls -la')).toBe(false)
    expect(dangerous('Get-ChildItem -Recurse')).toBe(false)
  })

  test('explains itself', () => {
    expect(dangerousCommandReason(words('git push --force'))).toContain(
      'force push',
    )
  })
})

describe('isKnownSafeCommand', () => {
  test('allows read-only programs', () => {
    expect(safe('ls -la')).toBe(true)
    expect(safe('cat notes.txt')).toBe(true)
    expect(safe('pwd')).toBe(true)
    expect(safe('Get-ChildItem -Path .')).toBe(true)
    expect(safe('get-content foo.txt')).toBe(true)
  })

  // The safe list is the one place a wrong answer grants something, so a
  // program that is not a bare name never qualifies.
  test('refuses a program reached by path', () => {
    expect(safe('/tmp/evil/ls')).toBe(false)
    expect(safe('./ls')).toBe(false)
    expect(safe('C:/tmp/evil/cat.exe x')).toBe(false)
  })

  test('allows only read-only git subcommands', () => {
    expect(safe('git status')).toBe(true)
    expect(safe('git log --oneline')).toBe(true)
    expect(safe('git diff HEAD')).toBe(true)
    expect(safe('git push')).toBe(false)
    expect(safe('git commit -m x')).toBe(false)
    expect(safe('git')).toBe(false)
  })

  test('refuses git flags that load configuration or run a program', () => {
    expect(safe('git -c core.pager=evil status')).toBe(false)
    expect(safe('git --exec-path=/tmp/evil status')).toBe(false)
  })

  test('refuses branch and tag operations that mutate', () => {
    expect(safe('git branch')).toBe(true)
    expect(safe('git branch -d old')).toBe(false)
    expect(safe('git tag -d v1')).toBe(false)
  })

  test('refuses find when it can run or delete', () => {
    expect(safe('find . -name *.ts')).toBe(true)
    expect(safe('find . -exec rm {} ;')).toBe(false)
    expect(safe('find . -delete')).toBe(false)
    expect(safe('find . -okdir rm {} ;')).toBe(false)
  })

  test('refuses search flags that hand over a program', () => {
    expect(safe('rg pattern src')).toBe(true)
    expect(safe('rg --pre evil pattern')).toBe(false)
    expect(safe('rg --pre=evil pattern')).toBe(false)
    expect(safe('grep --hostname-bin evil x')).toBe(false)
  })

  test('refuses anything not listed', () => {
    expect(safe('bun add zod')).toBe(false)
    expect(safe('curl https://example.com')).toBe(false)
  })
})

describe('isOpaqueHead', () => {
  // The input is the head a grant would record, not the command that was run.
  // Heads stop at the first flag, so a runtime invoked for inline code always
  // reduces to the program alone.
  test('rejects a runtime on its own, because the flag form reduces to it', () => {
    expect(isOpaqueHead(['node'])).toBe(true)
    expect(isOpaqueHead(['python3'])).toBe(true)
    expect(isOpaqueHead(['bun'])).toBe(true)
    expect(isOpaqueHead(['deno'])).toBe(true)
  })

  // `bun add` cannot cover `bun -e x`: the second word no longer matches.
  test('accepts a runtime once a subcommand narrows it', () => {
    expect(isOpaqueHead(['bun', 'add'])).toBe(false)
    expect(isOpaqueHead(['bun', 'run'])).toBe(false)
    expect(isOpaqueHead(['deno', 'task'])).toBe(false)
  })

  test('rejects shells whatever follows them', () => {
    expect(isOpaqueHead(['bash'])).toBe(true)
    expect(isOpaqueHead(['sh'])).toBe(true)
    expect(isOpaqueHead(['pwsh'])).toBe(true)
    expect(isOpaqueHead(['cmd'])).toBe(true)
  })

  // A subcommand does not narrow these: `sudo apt` still grants privilege,
  // and `env FOO=bar` names no program at all.
  test('rejects launchers even with a subcommand', () => {
    expect(isOpaqueHead(['sudo', 'apt'])).toBe(true)
    expect(isOpaqueHead(['env', 'FOO=bar'])).toBe(true)
    expect(isOpaqueHead(['xargs', 'rm'])).toBe(true)
    expect(isOpaqueHead(['timeout', '30'])).toBe(true)
  })

  test('rejects PowerShell evaluation and process starters', () => {
    expect(isOpaqueHead(['Invoke-Expression'])).toBe(true)
    expect(isOpaqueHead(['iex'])).toBe(true)
    expect(isOpaqueHead(['Start-Process', 'notepad'])).toBe(true)
  })

  test('sees through a qualified path and casing', () => {
    expect(isOpaqueHead(['/usr/bin/env', 'FOO=1'])).toBe(true)
    expect(isOpaqueHead(['C:/Windows/System32/cmd.exe'])).toBe(true)
    expect(isOpaqueHead(['NODE'])).toBe(true)
  })

  test('accepts ordinary programs', () => {
    expect(isOpaqueHead(['git', 'status'])).toBe(false)
    expect(isOpaqueHead(['bun', 'add'])).toBe(false)
    expect(isOpaqueHead(['Get-ChildItem'])).toBe(false)
    expect(isOpaqueHead(['tsc'])).toBe(false)
  })

  test('rejects an empty head', () => {
    expect(isOpaqueHead([])).toBe(true)
  })
})
