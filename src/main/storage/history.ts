/**
 * Revision history pruning. See PROGRAM_DESCRIPTION.md section 11.
 *
 * Policy: every snapshot for the last `keepAllHours`, then one per day for
 * `dailyDays`, then one per week beyond that (forever unless `weeklyWeeks`
 * caps it). Pruning never touches the current page document.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { HISTORY_DIR } from './paths'

export interface HistoryPolicy {
  enabled: boolean
  keepAllHours: number
  dailyDays: number
  /** null keeps one weekly snapshot forever. */
  weeklyWeeks: number | null
}

export const DEFAULT_HISTORY_POLICY: HistoryPolicy = { enabled: true, keepAllHours: 24, dailyDays: 30, weeklyWeeks: null }

/** Parse the timestamp in a snapshot file name (ISO with '-' in place of ':'). */
export function snapshotDate(name: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(\.\d{3})?Z/.exec(name)
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[5] ?? ''}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function weekKey(d: Date): string {
  // ISO week: Thursday of the same week identifies it.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${week}`
}

/** Names of snapshots the policy no longer keeps. Names without a parseable date are always kept. */
export function selectSnapshotsToDelete(names: string[], now: Date, policy: HistoryPolicy = DEFAULT_HISTORY_POLICY): string[] {
  if (!policy.enabled) return []
  const dated = names.map((name) => ({ name, date: snapshotDate(name) })).filter((x): x is { name: string; date: Date } => !!x.date)
  dated.sort((a, b) => b.date.getTime() - a.date.getTime()) // newest first
  const keep = new Set<string>()
  const seenDay = new Set<string>()
  const seenWeek = new Set<string>()
  const hourMs = 3600000
  for (const s of dated) {
    const age = now.getTime() - s.date.getTime()
    if (age <= policy.keepAllHours * hourMs) {
      keep.add(s.name)
    } else if (age <= policy.dailyDays * 24 * hourMs) {
      const k = dayKey(s.date)
      if (!seenDay.has(k)) {
        seenDay.add(k)
        keep.add(s.name)
      }
    } else if (policy.weeklyWeeks === null || age <= policy.weeklyWeeks * 7 * 24 * hourMs) {
      const k = weekKey(s.date)
      if (!seenWeek.has(k)) {
        seenWeek.add(k)
        keep.add(s.name)
      }
    }
  }
  return dated.filter((s) => !keep.has(s.name)).map((s) => s.name)
}

export async function pruneHistory(pageDir: string, policy: HistoryPolicy = DEFAULT_HISTORY_POLICY, now = new Date()): Promise<string[]> {
  const dir = join(pageDir, HISTORY_DIR)
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const doomed = selectSnapshotsToDelete(names, now, policy)
  for (const name of doomed) await fs.rm(join(dir, name), { force: true })
  return doomed
}
