// #480 — no two source modules may differ only by case. On a case-sensitive
// filesystem (Linux CI) `LocateCamera.tsx` and `locateCamera.ts` coexist; on
// Windows and a default macOS checkout `./LocateCamera` resolves to the wrong
// one, and typecheck, build and every App test fail. CI cannot see it, so this does.
import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path)
    return /\.(tsx?|jsx?|mjs)$/.test(name) ? [path] : []
  })
}

const stem = (path: string) => path.replace(/\.(test\.)?(tsx?|jsx?|mjs)$/, '')

describe('module names (#480)', () => {
  it('no two modules under cairn/src have stems equal ignoring case', () => {
    const byLower = new Map<string, Set<string>>()
    for (const path of sources(__dirname)) {
      const s = stem(path)
      const set = byLower.get(s.toLowerCase()) ?? new Set<string>()
      set.add(s)
      byLower.set(s.toLowerCase(), set)
    }
    const collisions = [...byLower.values()].filter((set) => set.size > 1).map((set) => [...set].sort())
    expect(collisions).toEqual([])
  })

  it('the framing maths is its own module, apart from the LocateCamera component', () => {
    const names = sources(join(__dirname, 'map')).map((p) =>
      p.slice(__dirname.length + 1).replace(/\\/g, '/'),
    )
    expect(names).toContain('map/locateFraming.ts')
    expect(names).toContain('map/LocateCamera.tsx')
    expect(names).not.toContain('map/locateCamera.ts')
  })
})
