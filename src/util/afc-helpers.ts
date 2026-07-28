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

export interface AfcLaneColorInput {
  color: string | null | undefined
  td1Color?: string | null
  td1Present: boolean
  showTd1: boolean
  spoolColor?: string | null
}

const DEFAULT_LANE_COLOR = '#808080'

/**
 * Resolve a lane's display colour: the TD-1 scanned colour when present and
 * enabled, otherwise the lane's own colour, then the assigned Spoolman spool's
 * colour (AFC leaves the lane colour unset when Spoolman was unreachable at
 * Klipper startup), falling back to a neutral grey.
 */
export const afcResolveLaneColor = (input: AfcLaneColorInput): string => {
  if (input.td1Present && input.td1Color && input.showTd1) {
    return `#${input.td1Color}`
  }
  return input.color || input.spoolColor || DEFAULT_LANE_COLOR
}

/**
 * The colours for a lane's fill — the Spoolman multi-colour set when it has more
 * than one, otherwise the single resolved colour.
 */
export const afcLaneColors = (resolvedColor: string, spoolColors?: readonly string[] | null): string[] => {
  if (spoolColors && spoolColors.length > 1) return [...spoolColors]
  return [resolvedColor]
}

/**
 * CSS background for a spool fill: a vertical gradient for multi-colour spools,
 * otherwise a solid colour.
 */
export const afcFillBackground = (colors: string[]): string => {
  return colors.length > 1
    ? `linear-gradient(to top, ${colors.join(', ')})`
    : colors[0]
}

/**
 * Format a lane's tool mapping into a badge, guarding against empty/NONE values.
 */
export const afcToolBadge = (map: string | string[] | null | undefined): string | null => {
  const tools = (Array.isArray(map) ? map : [map])
    .filter((tool): tool is string => typeof tool === 'string')
    .map(tool => tool.trim())
    .filter(tool => tool.length > 0 && tool.toUpperCase() !== 'NONE')

  return tools.length > 0
    ? tools.map(tool => tool.toUpperCase()).join(' ')
    : null
}

export interface AfcLaneAssignState {
  name: string
  editable: boolean
  hasSpool: boolean
}

/**
 * The next lane (after `current`, in order) that can take a spool but has none
 * assigned yet — used to auto-advance through unassigned lanes during setup.
 * Returns null when there is no such lane ahead.
 */
export const nextAssignableLane = (lanes: AfcLaneAssignState[], current: string): string | null => {
  const index = lanes.findIndex(lane => lane.name === current)
  if (index === -1) return null

  for (let i = index + 1; i < lanes.length; i++) {
    if (lanes[i].editable && !lanes[i].hasSpool) return lanes[i].name
  }

  return null
}
