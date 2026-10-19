/* eslint-disable @typescript-eslint/no-explicit-any */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { WriteLimitError } from '../budget.js'
import { declareRows, runToolCall } from '../call-context.js'
import { withReminder, type Mode } from '../mode.js'
import { describeRowChange, keyText, listCalls } from '../undo-format.js'
import {
  HiveError,
  apiDry,
  apiGet,
  apiWrite,
  normalizeDate,
  resolveBoard,
  resolvePosition,
  type HiveConfig,
} from './api'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true }

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] })

/** Failures reaching Hive become tool errors the model can read, not unhandled 500s. */
function guarded<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args)
    } catch (err) {
      if (err instanceof HiveError) return { ...text(`Error: ${err.message}`), isError: true }
      // The write budget's refusal is already the whole message (#410).
      if (err instanceof WriteLimitError) return { ...text(err.message), isError: true }
      throw err
    }
  }
}

const READ = { readOnlyHint: true } as const
const WRITE = { readOnlyHint: false, destructiveHint: false } as const
// Reverting is a write that can itself destroy later work (#412).
const UNDO = { readOnlyHint: false, destructiveHint: true } as const

/** The tools the read endpoint serves (#409). Everything else registered here is a write tool. */
export const HIVE_READ_TOOLS: ReadonlySet<string> = new Set([
  'hive_list_boards',
  'hive_list_owners',
  'hive_list_labels',
  'hive_list_items',
  'hive_get_item',
])

/**
 * Register the read tools, or the write tools, never both: the endpoints' lists
 * are disjoint, so a client with both connectors on sees no tool twice. A write
 * tool's successful result ends with a reminder that the write connector is on;
 * a refusal or a call that wrote nothing does not.
 */
export function registerHiveTools(server: McpServer, cfg: HiveConfig, mode: Mode = 'read'): void {
  const real = server
  const gated = {
    registerTool(name: string, config: unknown, handler: (args: any) => Promise<ToolResult>) {
      const isRead = HIVE_READ_TOOLS.has(name)
      if (isRead !== (mode === 'read')) return
      const run = isRead
        ? handler
        : async (args: any): Promise<ToolResult> => {
            const { result, state } = await runToolCall(() => handler(args))
            return state.wrote && !result.isError ? withReminder(result, 'Hive') : result
          }
      ;(real.registerTool as any).call(real, name, config, run)
    },
  } as unknown as McpServer
  server = gated
  server.registerTool(
    'hive_list_boards',
    { description: 'List all Hive kanban boards', annotations: READ },
    guarded(async () => {
      const result = await apiGet(cfg, 'getBoards')
      if (!result.success) return text(`Error: ${result.error}`)
      const boards: any[] = result.data
      if (!boards.length) return text('No boards found.')
      return text(
        boards
          .map((b) => `- **${b.name}** (id: ${b.id}${b.color ? `, color: ${b.color}` : ''})`)
          .join('\n'),
      )
    }),
  )

  server.registerTool(
    'hive_list_owners',
    { description: 'List valid owners for Hive board items', annotations: READ },
    guarded(async () => {
      const result = await apiGet(cfg, 'getOwners')
      if (!result.success) return text(`Error: ${result.error}`)
      const out = (result.data as any[]).map((o) => `- ${o.name} (${o.google_account})`).join('\n')
      return text(out || 'No owners found.')
    }),
  )

  server.registerTool(
    'hive_list_labels',
    {
      description: 'List valid labels for Hive board items. Optionally filter by board.',
      inputSchema: {
        board: z.string().optional().describe('Board name to filter labels by (optional — omit to list all)'),
      },
      annotations: READ,
    },
    guarded(async ({ board }: { board?: string }) => {
      const params: Record<string, string> = {}
      if (board) params.board_id = (await resolveBoard(cfg, board)).id
      const result = await apiGet(cfg, 'getLabels', params)
      if (!result.success) return text(`Error: ${result.error}`)
      const out = (result.data as any[]).map((l) => `- ${l.label}${l.color ? ` (${l.color})` : ''}`).join('\n')
      return text(out || 'No labels found.')
    }),
  )

  server.registerTool(
    'hive_create_label',
    {
      description: 'Create a new label for Hive board items',
      inputSchema: {
        label: z.string().describe('Label name'),
        color: z.string().optional().describe("Label color (e.g., 'red', '#FF0000')"),
        board: z.string().optional().describe('Board name to scope this label to (optional)'),
      },
      annotations: WRITE,
    },
    guarded(async ({ label, color, board }: { label: string; color?: string; board?: string }) => {
      const payload: Record<string, unknown> = { label, color: color || '' }
      if (board) payload.board_id = (await resolveBoard(cfg, board)).id
      const result = await apiWrite(cfg, 'createLabel', payload)
      if (!result.success) return text(`Error: ${result.error}`)
      const l = result.data
      return text(`Created label: **${l.label}**${l.color ? ` (${l.color})` : ''}`)
    }),
  )

  server.registerTool(
    'hive_list_items',
    {
      description:
        'List items on a Hive kanban board, optionally filtered by status and/or date range. Omit board to query across all boards.',
      inputSchema: {
        board: z.string().optional().describe("Board name (e.g., 'Work', 'Family'). Omit to query all boards."),
        status: z.enum(['To Do', 'In Progress', 'Done']).optional().describe('Filter by status'),
        due_after: z.string().optional().describe('Only items with due_date >= this date (YYYY-MM-DD)'),
        due_before: z.string().optional().describe('Only items with due_date <= this date (YYYY-MM-DD)'),
      },
      annotations: READ,
    },
    guarded(
      async ({
        board,
        status,
        due_after,
        due_before,
      }: {
        board?: string
        status?: 'To Do' | 'In Progress' | 'Done'
        due_after?: string
        due_before?: string
      }) => {
        // Resolve board name → id map for board_name enrichment
        const boardsResult = await apiGet(cfg, 'getBoards')
        const allBoards: any[] = boardsResult.success ? boardsResult.data : []
        const boardMap = Object.fromEntries(allBoards.map((b) => [b.id, b.name]))

        const params: Record<string, string> = {}
        let boardLabel = 'All boards'
        if (board) {
          const resolved = await resolveBoard(cfg, board)
          params.board_id = resolved.id
          boardLabel = resolved.name
        }
        if (status) params.status = status
        if (due_after) params.due_after = normalizeDate(due_after)
        if (due_before) params.due_before = normalizeDate(due_before)

        const result = await apiGet(cfg, 'getItems', params)
        if (!result.success) return text(`Error: ${result.error}`)
        const items: any[] = result.data
        if (!items.length) {
          return text(`No items found on "${boardLabel}"${status ? ` with status "${status}"` : ''}.`)
        }
        const out = items
          .map((i) => {
            const parts = [`- [${i.status}] **${i.title}** (id: ${i.id})`]
            parts.push(`board: ${boardMap[i.board_id] || 'unknown'}`)
            if (i.owner) parts.push(`(${i.owner})`)
            if (i.due_date) parts.push(`due: ${i.due_date}`)
            if (i.completed_at) parts.push(`completed: ${i.completed_at}`)
            if (i.labels) parts.push(`labels: ${i.labels}`)
            if (i.description) parts.push(`| ${i.description}`)
            return parts.join(' ')
          })
          .join('\n')
        return text(`**${boardLabel}**:\n${out}`)
      },
    ),
  )

  server.registerTool(
    'hive_add_item',
    {
      description: "Add a new item to a Hive kanban board. Status defaults to 'To Do'.",
      inputSchema: {
        board: z.string().describe("Board name (e.g., 'Work', 'Family')"),
        title: z.string().describe('Item title'),
        description: z.string().optional().describe('Item description'),
        owner: z.string().optional().describe('Owner name (must match an existing owner)'),
        due_date: z.string().optional().describe('Due date in ISO format (YYYY-MM-DD)'),
        labels: z.string().optional().describe('Comma-separated labels'),
        status: z.enum(['To Do', 'In Progress', 'Done']).optional().describe("Status (defaults to 'To Do')"),
        parent_id: z.string().optional().describe('ID of parent item (for creating sub-tasks)'),
        position: z
          .union([z.enum(['top', 'bottom']), z.coerce.number()])
          .optional()
          .describe("Position in column: 'top', 'bottom', or a 1-based index (default: bottom)"),
      },
      annotations: WRITE,
    },
    guarded(
      async ({
        board,
        title,
        description,
        owner,
        due_date,
        labels,
        status,
        parent_id,
        position,
      }: {
        board: string
        title: string
        description?: string
        owner?: string
        due_date?: string
        labels?: string
        status?: 'To Do' | 'In Progress' | 'Done'
        parent_id?: string
        position?: 'top' | 'bottom' | number
      }) => {
        const resolved = await resolveBoard(cfg, board)
        const itemOwner = owner || cfg.defaultOwner
        const itemStatus = status || 'To Do'
        const sort_order = await resolvePosition(cfg, resolved.id, itemStatus, position)

        const payload = {
          data: {
            title,
            description: description || '',
            owner: itemOwner,
            due_date: normalizeDate(due_date),
            labels: labels || '',
            board_id: resolved.id,
            status: itemStatus,
            parent_id: parent_id || '',
            ...(sort_order !== undefined && { sort_order }),
          },
          actor: 'hive-mcp',
        }

        const result = await apiWrite(cfg, 'createItem', payload)
        if (!result.success) return text(`Error creating item: ${result.error}`)

        const item = result.data
        const parts = [`Added to **${resolved.name}** board:`, `- **${item.title}**`]
        parts.push(`- Status: ${item.status}`)
        if (item.owner) parts.push(`- Owner: ${item.owner}`)
        if (item.due_date) parts.push(`- Due: ${item.due_date}`)
        if (item.labels) parts.push(`- Labels: ${item.labels}`)
        parts.push(`- ID: ${item.id}`)
        return text(parts.join('\n'))
      },
    ),
  )

  server.registerTool(
    'hive_get_item',
    {
      description:
        'Get full details of a single Hive item by ID. Use this to read the current description, status, etc. before updating.',
      inputSchema: { item_id: z.string().describe('ID of the item to fetch') },
      annotations: READ,
    },
    guarded(async ({ item_id }: { item_id: string }) => {
      const result = await apiGet(cfg, 'getItem', { id: item_id })
      if (!result.success) return text(`Error: ${result.error}`)
      const i = result.data
      const parts = [
        `**${i.title}** (id: ${i.id})`,
        `- Status: ${i.status}`,
        `- Owner: ${i.owner || 'none'}`,
        `- Due: ${i.due_date || 'none'}`,
        ...(i.completed_at ? [`- Completed: ${i.completed_at}`] : []),
        `- Labels: ${i.labels || 'none'}`,
        `- Board ID: ${i.board_id}`,
        `- Description: ${i.description || '(empty)'}`,
      ]
      if (i.parent_id) parts.push(`- Parent ID: ${i.parent_id}`)
      return text(parts.join('\n'))
    }),
  )

  server.registerTool(
    'hive_update_item',
    {
      description: 'Update an existing item on a Hive kanban board. Only provide fields you want to change.',
      inputSchema: {
        item_id: z.string().describe('ID of the item to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: z.enum(['To Do', 'In Progress', 'Done']).optional().describe('New status'),
        owner: z.string().optional().describe('New owner name'),
        due_date: z.string().optional().describe('New due date in ISO format (YYYY-MM-DD)'),
        completed_at: z.string().optional().describe(
          'When the item is in a terminal column: set when it was completed, as a date (YYYY-MM-DD, stored as noon UTC) or a full ISO 8601 timestamp with Z or an offset, not more than 24 hours ahead. Refused for an item in any other column. Cleared by moving the item out of its terminal column, not by an empty value',
        ),
        labels: z.string().optional().describe('New comma-separated labels (replaces existing)'),
        parent_id: z.string().optional().describe('New parent item ID'),
        position: z
          .union([z.enum(['top', 'bottom']), z.coerce.number()])
          .optional()
          .describe("Position in column: 'top', 'bottom', or a 1-based index"),
      },
      annotations: WRITE,
    },
    guarded(
      async ({
        item_id,
        title,
        description,
        status,
        owner,
        due_date,
        completed_at,
        labels,
        parent_id,
        position,
      }: {
        item_id: string
        title?: string
        description?: string
        status?: 'To Do' | 'In Progress' | 'Done'
        owner?: string
        due_date?: string
        completed_at?: string
        labels?: string
        parent_id?: string
        position?: 'top' | 'bottom' | number
      }) => {
        const changes: Record<string, unknown> = {}
        if (title !== undefined) changes.title = title
        if (description !== undefined) changes.description = description
        if (status !== undefined) changes.status = status
        if (owner !== undefined) changes.owner = owner
        if (due_date !== undefined) changes.due_date = normalizeDate(due_date)
        // Forwarded untouched, even when empty: the rule lives in Apps Script, and a third copy would drift.
        if (completed_at !== undefined) changes.completed_at = completed_at
        if (labels !== undefined) changes.labels = labels
        if (parent_id !== undefined) changes.parent_id = parent_id

        // Resolve position: need board_id from the existing item if changing position
        if (position !== undefined) {
          const itemResult = await apiGet(cfg, 'getItems', {})
          const allItems: any[] = itemResult.success ? itemResult.data : []
          const current = allItems.find((i) => i.id === item_id)
          if (current) {
            const targetStatus = status || current.status
            const sort_order = await resolvePosition(cfg, current.board_id, targetStatus, position)
            if (sort_order !== undefined) changes.sort_order = sort_order
          }
        }

        if (Object.keys(changes).length === 0) return text('No changes provided.')

        const result = await apiWrite(cfg, 'updateItem', { id: item_id, changes, actor: 'hive-mcp' })
        if (!result.success) return text(`Error updating item: ${result.error}`)

        const item = result.data
        const parts = [`Updated **${item.title}**:`]
        parts.push(`- Status: ${item.status}`)
        if (item.owner) parts.push(`- Owner: ${item.owner}`)
        if (item.due_date) parts.push(`- Due: ${item.due_date}`)
        if (item.completed_at) parts.push(`- Completed: ${item.completed_at}`)
        if (item.labels) parts.push(`- Labels: ${item.labels}`)
        parts.push(`- ID: ${item.id}`)
        return text(parts.join('\n'))
      },
    ),
  )
  server.registerTool(
    'hive_undo',
    {
      description:
        "Undo one write an agent made through this connector, using Hive's own Audit Log. With no arguments it " +
        'lists the last 20 MCP calls, newest first, each with its call id, time, actions and row count. With a ' +
        'call_id it is a dry run: it shows every change it would revert, and writes nothing. With confirm: true ' +
        'it reverts them. If any field the call touched has changed since, nothing is reverted and the changed ' +
        'fields are listed: it is all or nothing. A deleted item comes back with its original id and its ' +
        "sub-tasks, a created item or label is removed. The undo is itself a call in the list, so it can be " +
        "undone the same way. Only writes made through this connector are in the list: not edits in the app. " +
        'Reverting can destroy work done since, so only confirm what the user asked to undo.',
      inputSchema: {
        call_id: z.string().optional().describe('The call to undo, from the list. Omit to list recent calls'),
        confirm: z.boolean().optional().describe('Set true to actually revert. Default false = preview only.'),
      },
      annotations: UNDO,
    },
    guarded(async ({ call_id, confirm }: { call_id?: string; confirm?: boolean }) => {
      if (!call_id) {
        const result = await apiGet(cfg, 'getAuditLog', { actor: 'hive-mcp' })
        if (!result.success) return text(`Error: ${result.error}`)
        const lines = listCalls(
          (result.data as any[]).map((r) => ({ call_id: r.call_id, at: r.timestamp, action: r.action })),
        )
        return text(lines.length ? lines.join('\n') : "No MCP writes in Hive's Audit Log.")
      }

      const conflicted = (res: { error?: string; data?: any }): ToolResult | null => {
        const conflicts: any[] | undefined = res.data?.conflicts
        if (!conflicts) return null
        return {
          ...text(
            [
              `Nothing undone — ${conflicts.length} field${conflicts.length > 1 ? 's' : ''} changed since ${call_id}, ` +
                'so none were reverted:',
              ...conflicts.map(
                (c) =>
                  `- ${c.item_id || 'label'} ${c.field}: now ${JSON.stringify(c.current)}, expected ${JSON.stringify(c.expected)}`,
              ),
            ].join('\n'),
          ),
          isError: true,
        }
      }

      const preview = await apiDry(cfg, 'undoCall', { call_id })
      if (!preview.success) return conflicted(preview) ?? { ...text(`Error: ${preview.error}`), isError: true }
      const changes: any[] = preview.data.changes
      if (!confirm) {
        const lines = changes.map(
          (c) =>
            `- ${c.type} "${c.title}"${c.item_id ? ` (${c.item_id})` : ''}` +
            (c.type === 'set' ? `: ${describeRowChange({ [c.field]: c.current }, { [c.field]: c.restore })}` : ''),
        )
        return text(
          [`DRY RUN — nothing reverted. Undoing ${call_id} would:`, ...lines, '', 'Call again with confirm: true to undo.'].join(
            '\n',
          ),
        )
      }

      // The preview told us how many rows this will write, for the hourly budget.
      declareRows(preview.data.count)
      let done
      try {
        done = await apiWrite(cfg, 'undoCall', { call_id, confirm: true })
      } catch (err) {
        if (err instanceof HiveError && /not JSON|Could not reach/.test(err.message)) {
          throw new HiveError(
            `${err.message} The undo was sent once and not retried: it may or may not have applied. ` +
              'Call hive_undo with no arguments to read the list again before retrying.',
          )
        }
        throw err
      }
      if (!done.success) return conflicted(done) ?? { ...text(`Error: ${done.error}`), isError: true }
      return text(
        `Undid ${call_id}: ${done.data.count} rows restored. This undo is itself call ${done.data.undo_call_id}, ` +
          'and can be undone the same way.',
      )
    }),
  )
}
