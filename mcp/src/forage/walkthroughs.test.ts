import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #711: forage_set_walkthrough, forage_delete_walkthrough and the walkthrough
// in forage_get_recipe, over a fake Forage API. The validator itself is tested
// in forage/apps-script/tests/walkthroughs.test.ts.

const URL_ = 'https://script.google.com/macros/s/forage/exec'
const env = {
  FORAGE_API_URL: URL_,
  FORAGE_API_KEY: 'forage-key',
  WRITE_BUDGET: fakeBudget({ now: Date.UTC(2026, 10, 1, 18) }).namespace,
} as Env
const REMINDER = "— Forage (write) is on. Turn it off in Search and tools when you've finished writing."

type Result = { content: { text: string }[]; isError?: boolean }
type Sent = { action: string; payload: any; params: URLSearchParams }

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const mode = FORAGE_READ_TOOLS.has(name) ? 'read' : 'write'
  const req = new Request('https://example.test/forage/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const res = await handleForage(req, env, mode)
  return ((await res.json()) as { result: Result }).result
}

async function listWriteTools() {
  const req = new Request('https://example.test/forage/write/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  const res = await handleForage(req, env, 'write')
  return ((await res.json()) as { result: { tools: any[] } }).result.tools
}

function api(answers: Record<string, (r: Sent) => unknown>) {
  const sent: Sent[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body ?? ''))
      const raw = params.get('payload')
      const r = { action: params.get('action') ?? '', payload: raw ? JSON.parse(raw) : undefined, params }
      sent.push(r)
      const fn = answers[r.action]
      const out = fn ? fn(r) : { success: false, error: `Unknown action "${r.action}"` }
      return new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return sent
}
afterEach(() => vi.unstubAllGlobals())

const DOC = {
  format: 1,
  recipe: 'rc_stew',
  prep: [],
  cook: [{ id: 'cook', title: 'Cook it', do: 'Cook it.', uses: [{ line: 'L1' }] }],
}
const SAVED = {
  recipe_id: 'rc_stew',
  format: 1,
  walkthrough: DOC,
  updated: 'x',
  recipe_name: 'Beef Stew',
  warnings: [],
  summary: { prep_groups: 6, tasks: 15, cook_steps: 7, active: 19, waited: 120 },
}

describe('forage_set_walkthrough', () => {
  it('saves, answering the summary, the undo call and the reminder', async () => {
    const sent = api({ setWalkthrough: () => ({ success: true, data: SAVED }) })
    const r = await call('forage_set_walkthrough', { recipe_id: 'rc_stew', walkthrough: DOC })
    expect(r.isError).toBeFalsy()
    expect(sent[0].payload).toMatchObject({ recipe_id: 'rc_stew', walkthrough: DOC })
    expect(sent[0].payload.call_id).toEqual(expect.any(String))
    const lines = r.content[0].text.split('\n')
    expect(lines[0]).toBe(
      'Saved the walkthrough for "Beef Stew" (rc_stew): 6 prep groups (15 tasks), 7 cook steps, ' +
        '19 min of timed cooking, 120 min of waiting.',
    )
    expect(lines[1]).toBe(`Undo with forage_undo, call ${sent[0].payload.call_id}`)
    expect(r.content.map((c) => c.text).join('\n')).toContain(REMINDER)
  })

  it('carries the warnings on their own line', async () => {
    const warning = 'cook brown: "do" seems to give an amount ("2 tbsp"); amounts come from the recipe lines and would not scale'
    api({ setWalkthrough: () => ({ success: true, data: { ...SAVED, warnings: [warning] } }) })
    const r = await call('forage_set_walkthrough', { recipe_id: 'rc_stew', walkthrough: DOC })
    expect(r.content[0].text.split('\n')[1]).toBe(`Warnings: ${warning}.`)
  })

  it("refuses with the validator's messages, and no reminder", async () => {
    const problems = [
      'line L2 (salt): shares add up to 0.5, not 1 (used in prep beef 0.5)',
      'cook finish "Thicken and finish": prep beef was already used in cook brown',
    ]
    api({
      setWalkthrough: () => ({ success: false, error: 'x', code: 'invalid_walkthrough', problems, warnings: [] }),
    })
    const r = await call('forage_set_walkthrough', { recipe_id: 'rc_stew', walkthrough: DOC })
    expect(r.isError).toBe(true)
    expect(r.content.map((c) => c.text).join('\n')).toBe(
      ['Nothing saved. 2 problems:', `- ${problems[0]}`, `- ${problems[1]}`, 'Fix these and call again.'].join('\n'),
    )
  })

  it('counts the problems past 20', async () => {
    const problems = [...Array.from({ length: 20 }, (_, i) => `cook s${i}: needs "do" text`), 'and 3 more']
    api({ setWalkthrough: () => ({ success: false, error: 'x', code: 'invalid_walkthrough', problems }) })
    const text = (await call('forage_set_walkthrough', { recipe_id: 'rc_stew', walkthrough: DOC })).content[0].text
    expect(text.split('\n')[0]).toBe('Nothing saved. 23 problems:')
    expect(text.split('\n')[21]).toBe('and 3 more')
  })

  it('names a recipe that does not exist', async () => {
    api({ setWalkthrough: () => ({ success: false, error: 'There is no recipe rc_none', code: 'not_found' }) })
    const r = await call('forage_set_walkthrough', { recipe_id: 'rc_none', walkthrough: DOC })
    expect(r.content[0].text).toBe('Nothing saved. There is no recipe rc_none.')
  })

  it("carries the format reference in the walkthrough input's description", async () => {
    const tool = (await listWriteTools()).find((t) => t.name === 'forage_set_walkthrough')
    const description: string = tool.inputSchema.properties.walkthrough.description
    expect(description).toContain('"format": 1')
    expect(description).toContain('meanwhile')
    expect(description).toContain('Get the recipe with forage_get_recipe first: use its line ids (L1, L2…), and write no quantities.')
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
  })
})

describe('forage_delete_walkthrough', () => {
  it('deletes, undoably', async () => {
    const sent = api({ deleteWalkthrough: () => ({ success: true, data: { recipe_id: 'rc_stew', deleted: true } }) })
    const r = await call('forage_delete_walkthrough', { recipe_id: 'rc_stew' })
    expect(r.content[0].text.split('\n').slice(0, 2)).toEqual([
      'Deleted the walkthrough of recipe rc_stew.',
      `Undo with forage_undo, call ${sent[0].payload.call_id}`,
    ])
    expect(r.content.map((c) => c.text).join('\n')).toContain(REMINDER)
    const tool = (await listWriteTools()).find((t) => t.name === 'forage_delete_walkthrough')
    expect(tool.annotations).toMatchObject({ destructiveHint: true })
  })

  it('refuses a recipe with none', async () => {
    api({ deleteWalkthrough: () => ({ success: false, error: 'Recipe "rc_stew" has no walkthrough' }) })
    const r = await call('forage_delete_walkthrough', { recipe_id: 'rc_stew' })
    expect(r).toMatchObject({ isError: true })
    expect(r.content[0].text).toBe('Nothing deleted. Recipe "rc_stew" has no walkthrough')
  })
})

describe('forage_get_recipe', () => {
  const recipe = (check: unknown) => ({
    success: true,
    data: { id: 'rc_stew', name: 'Beef Stew', lines: [], steps: [], walkthrough: DOC, walkthrough_check: check },
  })
  const reads = (check: unknown) =>
    api({
      getRecipe: () => recipe(check),
      getCooks: () => ({ success: true, data: [] }),
      getFoods: () => ({ success: true, data: [] }),
    })

  it('returns the walkthrough and its check', async () => {
    reads({ ok: true, problems: [], warnings: [] })
    const text = (await call('forage_get_recipe', { id: 'rc_stew' })).content[0].text
    expect(JSON.parse(text)).toMatchObject({ walkthrough: DOC, walkthrough_check: { ok: true, problems: [] } })
  })

  it('ends with the problems of a stale walkthrough', async () => {
    reads({ ok: false, problems: ['cook brown: no ingredient line L5'], warnings: [] })
    const text = (await call('forage_get_recipe', { id: 'rc_stew' })).content[0].text
    expect(text.split('\n').at(-1)).toBe('Walkthrough needs an update: cook brown: no ingredient line L5')
    expect(JSON.parse(text.slice(0, text.lastIndexOf('\n'))).walkthrough_check.ok).toBe(false)
  })
})
