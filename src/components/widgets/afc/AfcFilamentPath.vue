<template>
  <div
    class="afc-filament-path"
    :class="{ 'afc-filament-path--dark': $vuetify.theme.dark }"
  >
    <template v-for="(node, index) in nodes">
      <div
        :key="`node-${node.key}`"
        class="path-node"
      >
        <div
          class="path-node-icon"
          :class="{ 'path-node-icon--frontier': node.frontier }"
          :style="nodeStyle(node)"
        >
          <v-icon
            :color="node.reached ? frontierColor : undefined"
            :class="{ 'text--disabled': !node.reached }"
          >
            {{ node.icon }}
          </v-icon>
        </div>
        <div
          class="path-node-label"
          :class="{ 'text--disabled': !node.reached }"
        >
          {{ node.label }}
        </div>
        <div
          v-if="node.caption"
          class="path-node-caption"
          :style="{ color: node.reached ? frontierColor : undefined }"
        >
          {{ node.caption }}
        </div>
      </div>

      <div
        v-if="index < nodes.length - 1"
        :key="`seg-${node.key}`"
        class="path-segment"
      >
        <div
          class="path-segment-fill"
          :style="segmentStyle(index + 1)"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'
import { computeAfcPathReached, afcPathLevel } from '@/util/afc-helpers'

interface PathNode {
  key: string
  label: string
  icon: string
  reached: boolean
  frontier: boolean
  caption?: string
}

@Component({})
export default class AfcFilamentPath extends Mixins(StateMixin, AfcMixin) {
  // Number of nodes currently revealed (animated towards the real target).
  animatedLevel = 0
  private animationTimer: ReturnType<typeof setTimeout> | null = null

  mounted () {
    this.animatedLevel = this.targetLevel
  }

  beforeDestroy () {
    this.clearAnimation()
  }

  get loadedLane (): Klipper.AfcLaneState | undefined {
    for (const laneName of this.afcLanes) {
      const lane = this.getAfcLaneObject(laneName)
      if (lane?.tool_loaded === true) return lane
    }
    return undefined
  }

  get firstReadyLane (): Klipper.AfcLaneState | undefined {
    for (const laneName of this.afcLanes) {
      const lane = this.getAfcLaneObject(laneName)
      if (lane?.load === true && lane.prep === true) return lane
    }
    return undefined
  }

  get isLoaded (): boolean {
    return this.loadedLane != null
  }

  get displayLane (): Klipper.AfcLaneState | undefined {
    return this.loadedLane ?? this.firstReadyLane
  }

  get frontierColor (): string {
    const lane = this.displayLane
    if (lane?.td1_color && this.afc?.td1_present && this.afcShowTd1Color) return `#${lane.td1_color}`
    if (lane?.color) return lane.color
    return '#2e9d4f'
  }

  get hasBuffer (): boolean {
    return this.displayLane?.buffer != null
  }

  get bufferCaption (): string | undefined {
    if (!this.isLoaded) return undefined
    const status = this.loadedLane?.buffer_status ?? this.afcCurrentBuffer?.state
    switch (status) {
      case 'Advancing':
        return this.$t('app.afc.Path.compressing').toString()
      case 'Trailing':
        return this.$t('app.afc.Path.expanding').toString()
      default:
        return undefined
    }
  }

  get laneLabel (): string {
    const lane = this.displayLane
    if (lane?.name) return this.$filters.prettyCase(lane.name)
    return this.$t('app.afc.Path.lane').toString()
  }

  /*
   * Real reached state per node (monotonic: lane → hub → buffer → toolhead)
   */
  get rawReached (): boolean[] {
    const loaded = this.loadedLane
    return computeAfcPathReached({
      laneReached: this.displayLane != null,
      atHub: this.isLoaded && loaded?.loaded_to_hub === true,
      atTool: this.isLoaded && loaded?.tool_loaded === true,
      hasBuffer: this.hasBuffer,
    })
  }

  get targetLevel (): number {
    return afcPathLevel(this.rawReached)
  }

  @Watch('targetLevel')
  onTargetLevelChanged (target: number) {
    this.animateTo(target)
  }

  private animateTo (target: number) {
    this.clearAnimation()

    // Respect reduced-motion: jump straight to the target with no stepping.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.animatedLevel = target
      return
    }

    const step = () => {
      if (this.animatedLevel === target) return
      this.animatedLevel += this.animatedLevel < target ? 1 : -1
      this.animationTimer = setTimeout(step, 100)
    }

    step()
  }

  private clearAnimation () {
    if (this.animationTimer !== null) {
      clearTimeout(this.animationTimer)
      this.animationTimer = null
    }
  }

  get nodes (): PathNode[] {
    const defs = [
      { key: 'lane', label: this.laneLabel, icon: '$afcIcon' },
      { key: 'hub', label: this.$t('app.afc.Path.hub').toString(), icon: '$afcPathHub' },
    ]

    if (this.hasBuffer) {
      defs.push({ key: 'buffer', label: this.$t('app.afc.Path.buffer').toString(), icon: '$afcPathBuffer' })
    }

    defs.push({ key: 'toolhead', label: this.$t('app.afc.Path.toolhead').toString(), icon: '$printer3dNozzle' })

    const level = this.animatedLevel

    return defs.map((def, index) => ({
      ...def,
      reached: index < level,
      frontier: index === level - 1 && level > 0,
      caption: def.key === 'buffer' ? this.bufferCaption : undefined,
    }))
  }

  nodeStyle (node: PathNode) {
    if (!node.reached) return {}
    return {
      borderColor: this.frontierColor,
      boxShadow: node.frontier ? `0 0 0 3px ${this.frontierColor}33` : 'none',
    }
  }

  segmentStyle (nextIndex: number) {
    return {
      width: nextIndex < this.animatedLevel ? '100%' : '0%',
      background: this.frontierColor,
    }
  }
}
</script>

<style scoped>
.afc-filament-path {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 4px;
    padding: 12px 8px 4px;
    width: 100%;
}

.path-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
}

.path-node-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(127, 127, 127, 0.35);
    background: rgba(127, 127, 127, 0.08);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.path-node-icon--frontier {
    background: rgba(127, 127, 127, 0.04);
}

.path-node-label {
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
}

.path-node-caption {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1;
    min-height: 0.8em;
}

.path-segment {
    flex: 1 1 auto;
    height: 4px;
    margin-top: 21px;
    border-radius: 2px;
    background: rgba(127, 127, 127, 0.28);
    overflow: hidden;
    min-width: 16px;
}

.path-segment-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
    .path-node-icon {
        transition: none;
    }

    .path-segment-fill {
        transition: none;
    }
}
</style>
