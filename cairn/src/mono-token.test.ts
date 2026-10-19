// #341 — the monospace face is a token. `--mono` is defined once, in index.css,
// and every stylesheet that wants the face says `var(--mono)`; a literal stack
// is how one copy (MapUnavailable's, without Consolas) drifted from the other
// nineteen. design-language.md's type table gives the token its row.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const src = join(__dirname)

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : stylesheets(path)
    return name.endsWith('.css') ? [path] : []
  })
}

const files = stylesheets(src)
const text = (path: string) => readFileSync(path, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('--mono (#341)', () => {
  it('is defined once, in index.css, with exactly the stack', () => {
    const index = text(join(src, 'index.css'))
    const defs = [...index.matchAll(/--mono\s*:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(defs).toEqual([STACK])
  })

  it('is the only place a literal monospace stack appears in a stylesheet', () => {
    const offenders = files
      .filter((f) => !f.endsWith('index.css'))
      .filter((f) => /ui-monospace|SFMono-Regular/.test(text(f)))
      .map((f) => f.slice(src.length + 1))
    expect(offenders).toEqual([])
  })

  it('no font-family names a bare monospace stack, in index.css or elsewhere', () => {
    const bare = files.flatMap((f) =>
      [...text(f).matchAll(/font-family\s*:\s*([^;]*monospace[^;]*);/g)].map((m) => `${f}: ${m[1]}`),
    )
    expect(bare).toEqual([])
  })

  it('is used: every declaration that wanted the face now reads the token', () => {
    const uses = files.flatMap((f) => [...text(f).matchAll(/font-family\s*:\s*var\(--mono\)/g)])
    expect(uses.length).toBe(20)
  })

  it('has a row in design-language.md', () => {
    const doc = readFileSync(join(src, '..', 'docs', 'design', 'design-language.md'), 'utf-8')
    expect(doc).toMatch(/\| `--mono` \| `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` \|/)
  })

  it('MapUnavailable draws the same face as the rest', () => {
    const css = text(join(src, 'components', 'MapUnavailable.css'))
    expect(css).toMatch(/font-family\s*:\s*var\(--mono\)/)
  })
})
