import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* @keel/geo is shared with projects on different view libraries (cairn is
   React, thrive is Preact), so it may import none of them. */
const FORBIDDEN = /^(react|react-dom|preact|@vis\.gl)(\/|$)/

const here = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|js|jsx|mts|cts)$/.test(name) ? [path] : []
  })
}

function specifiers(source: string): string[] {
  const found: string[] = []
  const pattern = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) found.push(match[1])
  return found
}

describe('no view library', () => {
  it('imports none from any file under src/', () => {
    const offenders = sourceFiles(here)
      .filter((file) => !file.endsWith('noViewLibrary.test.ts'))
      .flatMap((file) =>
        specifiers(readFileSync(file, 'utf8'))
          .filter((s) => FORBIDDEN.test(s))
          .map((s) => `${file}: ${s}`),
      )
    expect(offenders).toEqual([])
  })

  it('declares none in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
    const declared = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    })
    expect(declared.filter((name) => FORBIDDEN.test(name))).toEqual([])
  })

  it('catches an import when one is present', () => {
    expect(specifiers(`import { useState } from 'react'`).some((s) => FORBIDDEN.test(s))).toBe(true)
    expect(specifiers(`import x from '@vis.gl/react-google-maps'`).some((s) => FORBIDDEN.test(s))).toBe(true)
    expect(specifiers(`import x from './reactive'`).some((s) => FORBIDDEN.test(s))).toBe(false)
  })
})
