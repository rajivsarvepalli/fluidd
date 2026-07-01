import {
  buildEndlessSpoolChains,
  getAfcLaneStatus,
  computeSpoolPercent,
  computeAfcPathReached,
  afcPathLevel,
  type AfcRunoutLink,
  type AfcLaneStatusInput
} from '../afc-helpers'

describe('buildEndlessSpoolChains', () => {
  const link = (name: string, runoutLane: string | null): AfcRunoutLink => ({ name, runoutLane })

  it('returns no chains when there are no runout links', () => {
    expect(buildEndlessSpoolChains([
      link('lane1', null),
      link('lane2', 'NONE')
    ])).toStrictEqual([])
  })

  it('builds a simple two-lane chain', () => {
    expect(buildEndlessSpoolChains([
      link('lane1', 'lane2'),
      link('lane2', 'NONE')
    ])).toStrictEqual([
      { lanes: ['lane1', 'lane2'], loops: false }
    ])
  })

  it('follows a multi-lane chain in order', () => {
    expect(buildEndlessSpoolChains([
      link('lane2', 'lane3'),
      link('lane3', 'lane4'),
      link('lane4', 'NONE')
    ])).toStrictEqual([
      { lanes: ['lane2', 'lane3', 'lane4'], loops: false }
    ])
  })

  it('builds two independent chains', () => {
    expect(buildEndlessSpoolChains([
      link('lane1', 'lane2'),
      link('lane3', 'lane4')
    ])).toStrictEqual([
      { lanes: ['lane1', 'lane2'], loops: false },
      { lanes: ['lane3', 'lane4'], loops: false }
    ])
  })

  it('flags a looping chain', () => {
    expect(buildEndlessSpoolChains([
      link('lane2', 'lane3'),
      link('lane3', 'lane4'),
      link('lane4', 'lane2')
    ])).toStrictEqual([
      { lanes: ['lane2', 'lane3', 'lane4'], loops: true }
    ])
  })

  it('ignores NONE and empty runout targets', () => {
    expect(buildEndlessSpoolChains([
      link('lane1', ''),
      link('lane2', 'NONE'),
      link('lane3', null)
    ])).toStrictEqual([])
  })
})

describe('getAfcLaneStatus', () => {
  const base: AfcLaneStatusInput = {
    status: 'Loaded',
    load: true,
    prep: true,
    toolLoaded: false,
    isCurrent: false,
    printing: false,
    errorState: false
  }

  it.each<[Partial<AfcLaneStatusInput>, string]>([
    [{ status: 'Error' }, 'error'],
    [{ isCurrent: true, errorState: true }, 'error'],
    [{ status: 'Tool Loading' }, 'loading'],
    [{ status: 'HUB Loading' }, 'loading'],
    [{ status: 'Tool Unloading' }, 'unloading'],
    [{ status: 'Ejecting' }, 'unloading'],
    [{ status: 'None', load: false, prep: false }, 'empty'],
    [{ status: 'None', load: false, prep: true }, 'prep'],
    [{ toolLoaded: true, printing: true, isCurrent: true }, 'printing'],
    [{ toolLoaded: true, printing: false }, 'loaded'],
    [{ toolLoaded: true, printing: true, isCurrent: false }, 'loaded'],
    [{ load: true, prep: true, toolLoaded: false }, 'ready']
  ])('maps %o to status "%s"', (overrides, expected) => {
    expect(getAfcLaneStatus({ ...base, ...overrides })).toBe(expected)
  })

  it('prioritises a loading state over the empty state', () => {
    expect(getAfcLaneStatus({ ...base, status: 'Tool Loading', load: false, prep: false })).toBe('loading')
  })
})

describe('computeSpoolPercent', () => {
  it.each<[number | null | undefined, number | null | undefined, number]>([
    [500, 1000, 50],
    [333, 1000, 33],
    [1000, 1000, 100],
    [2000, 1000, 100],
    [-50, 1000, 0],
    [null, 1000, -1],
    [500, null, -1],
    [500, 0, -1],
    [undefined, undefined, -1]
  ])('computes percent for remaining=%s total=%s', (remaining, total, expected) => {
    expect(computeSpoolPercent(remaining, total)).toBe(expected)
  })
})

describe('computeAfcPathReached / afcPathLevel', () => {
  it('returns three nodes without a buffer', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: false, atTool: false, hasBuffer: false })
    expect(reached).toStrictEqual([true, false, false])
    expect(afcPathLevel(reached)).toBe(1)
  })

  it('no buffer: filament at hub, not yet at toolhead', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: false, hasBuffer: false })
    expect(reached).toStrictEqual([true, true, false])
    expect(afcPathLevel(reached)).toBe(2)
  })

  it('no buffer: filament fully loaded to toolhead', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: true, hasBuffer: false })
    expect(reached).toStrictEqual([true, true, true])
    expect(afcPathLevel(reached)).toBe(3)
  })

  it('returns four nodes with a buffer', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: true, hasBuffer: true })
    expect(reached).toStrictEqual([true, true, true, true])
    expect(afcPathLevel(reached)).toBe(4)
  })

  it('with buffer: filament at hub lights the buffer node too (no separate buffer sensor)', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: false, hasBuffer: true })
    expect(reached).toStrictEqual([true, true, true, false])
    expect(afcPathLevel(reached)).toBe(3)
  })

  it('stops at the hub when not loaded to the toolhead (with buffer)', () => {
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: false, hasBuffer: true })
    expect(reached).toStrictEqual([true, true, true, false])
    expect(afcPathLevel(reached)).toBe(3)
  })

  it('is empty when nothing is reached', () => {
    const reached = computeAfcPathReached({ laneReached: false, atHub: false, atTool: false, hasBuffer: false })
    expect(reached).toStrictEqual([false, false, false])
    expect(afcPathLevel(reached)).toBe(0)
  })

  it('no buffer: afcPathLevel never exceeds node count of 3', () => {
    // Sanity check: max level without buffer is 3
    const reached = computeAfcPathReached({ laneReached: true, atHub: true, atTool: true, hasBuffer: false })
    expect(reached.length).toBe(3)
    expect(afcPathLevel(reached)).toBeLessThanOrEqual(3)
  })
})
