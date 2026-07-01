/**
 * Pure helpers for the AFC lane-card UI.
 *
 * These are extracted from the AFC components so the logic can be unit tested
 * independently of Vue / the store.
 */

export interface AfcRunoutLink {
  name: string
  runoutLane: string | null
}

export interface AfcEndlessChain {
  lanes: string[]
  loops: boolean
}

const NONE = 'NONE'

/**
 * Build endless-spool runout chains from per-lane runout links.
 *
 * A link `{ name: 'lane1', runoutLane: 'lane2' }` means "when lane1 runs out,
 * switch to lane2". Lanes are followed into ordered chains (lane1 → lane2 → …).
 * Chains that cycle back on themselves are flagged with `loops: true`.
 *
 * Only chains with at least two lanes (or a loop) are returned.
 */
export const buildEndlessSpoolChains = (links: AfcRunoutLink[]): AfcEndlessChain[] => {
  const runout: Record<string, string> = {}
  for (const link of links) {
    if (link.runoutLane && link.runoutLane !== NONE) {
      runout[link.name] = link.runoutLane
    }
  }

  const sources = Object.keys(runout)
  if (sources.length === 0) return []

  const targets = new Set(Object.values(runout))
  const visited = new Set<string>()

  const follow = (start: string): AfcEndlessChain => {
    const lanes: string[] = []
    const seen = new Set<string>()
    let cur: string | undefined = start
    while (cur && !seen.has(cur)) {
      lanes.push(cur)
      seen.add(cur)
      visited.add(cur)
      cur = runout[cur]
    }
    return { lanes, loops: cur != null && seen.has(cur) }
  }

  const chains: AfcEndlessChain[] = []

  // Open chains: start from a source that nothing else points to.
  for (const source of sources) {
    if (!targets.has(source) && !visited.has(source)) {
      chains.push(follow(source))
    }
  }
  // Pure loops: any remaining unvisited source.
  for (const source of sources) {
    if (!visited.has(source)) {
      chains.push(follow(source))
    }
  }

  return chains.filter(chain => chain.lanes.length >= 2 || chain.loops)
}

export type AfcLaneStatusKey =
  | 'error'
  | 'loading'
  | 'unloading'
  | 'empty'
  | 'prep'
  | 'printing'
  | 'loaded'
  | 'ready'

export interface AfcLaneStatusInput {
  status: string | null
  load: boolean
  prep: boolean
  toolLoaded: boolean
  isCurrent: boolean
  printing: boolean
  errorState: boolean
}

const LOADING_STATES = ['Tool Loading', 'HUB Loading']
const UNLOADING_STATES = ['Tool Unloading', 'Ejecting']

/**
 * Derive the lane status key from the real AFC lane state.
 * The component maps the key to a label/colour/spinner.
 */
export const getAfcLaneStatus = (input: AfcLaneStatusInput): AfcLaneStatusKey => {
  if (input.status === 'Error' || (input.isCurrent && input.errorState)) return 'error'
  if (input.status != null && LOADING_STATES.includes(input.status)) return 'loading'
  if (input.status != null && UNLOADING_STATES.includes(input.status)) return 'unloading'
  if (!input.prep && !input.load) return 'empty'
  if (input.prep && !input.load) return 'prep'
  if (input.toolLoaded) {
    return input.printing && input.isCurrent ? 'printing' : 'loaded'
  }
  return 'ready'
}

/**
 * Remaining filament as a 0-100 percentage, or -1 when it can't be computed.
 */
export const computeSpoolPercent = (
  remaining?: number | null,
  total?: number | null
): number => {
  if (remaining == null || total == null || total === 0) return -1
  return Math.round(Math.max(0, Math.min(100, (remaining / total) * 100)))
}

export interface AfcPathInput {
  laneReached: boolean
  atHub: boolean
  atTool: boolean
  hasBuffer: boolean
}

/**
 * Monotonic reached-state per filament-path node: Lane → Hub → [Buffer] → Toolhead.
 */
export const computeAfcPathReached = (input: AfcPathInput): boolean[] => {
  const reached = [input.laneReached, input.atHub]
  if (input.hasBuffer) reached.push(input.atHub)
  reached.push(input.atTool)
  return reached
}

/**
 * Number of nodes reached (index of the furthest reached node + 1).
 */
export const afcPathLevel = (reached: boolean[]): number => {
  return reached.lastIndexOf(true) + 1
}
