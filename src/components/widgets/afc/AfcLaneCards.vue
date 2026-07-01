<template>
  <div class="afc-lane-cards-wrapper">
    <!-- Loading skeletons (klippy not ready yet) -->
    <div
      v-if="!hasAnyLanes && !klippyReady"
      class="afc-lane-cards"
    >
      <v-skeleton-loader
        v-for="n in 4"
        :key="`skeleton-${n}`"
        type="image"
        class="lane-skeleton"
      />
    </div>

    <!-- Empty state (ready, but nothing configured) -->
    <div
      v-else-if="!hasAnyLanes"
      class="afc-empty-state text--disabled"
    >
      <v-icon
        large
        class="mb-2"
      >
        $afcIcon
      </v-icon>
      <div>{{ $t('app.afc.LaneCard.no_lanes') }}</div>
    </div>

    <template
      v-for="unit in filteredUnits"
      v-else
    >
      <div
        v-if="filteredUnits.length > 1"
        :key="`unit-header-${unit}`"
        class="lane-cards-unit-header text--secondary"
      >
        {{ $filters.prettyCase(unitName(unit)) }}
      </div>

      <div
        :key="`unit-grid-${unit}`"
        class="afc-lane-cards"
      >
        <afc-lane-card
          v-for="lane in unitLanes(unit)"
          :key="`lane-${lane}`"
          :name="lane"
        />
      </div>
    </template>

    <!-- Endless-spool chains -->
    <div
      v-if="afcShowLaneInfinite && endlessChains.length > 0"
      class="afc-es-chains"
    >
      <div class="afc-es-title text--secondary">
        <v-icon
          x-small
          class="me-1"
        >
          $afcIconInfinity
        </v-icon>
        {{ $t('app.afc.LaneCard.endless_spool') }}
      </div>
      <div
        v-for="(chain, ci) in endlessChains"
        :key="`chain-${ci}`"
        class="afc-es-chain"
      >
        <template v-for="(lane, li) in chain.lanes">
          <span
            :key="`chain-${ci}-lane-${li}`"
            class="afc-es-chip"
          >
            <span
              class="afc-es-swatch"
              :style="{ background: lane.color }"
            />
            {{ lane.label }}
          </span>
          <v-icon
            v-if="li < chain.lanes.length - 1"
            :key="`chain-${ci}-arrow-${li}`"
            x-small
            class="afc-es-arrow"
          >
            $chevronRight
          </v-icon>
        </template>
        <v-icon
          v-if="chain.loops"
          x-small
          class="afc-es-loop ms-1"
        >
          $afcIconInfinity
        </v-icon>
      </div>
    </div>

    <!-- Loaded-lane action bar -->
    <div
      class="afc-action-bar"
      :class="{ 'afc-action-bar--dark': $vuetify.theme.dark }"
    >
      <div class="afc-action-bar-label text-truncate">
        <span
          class="afc-action-bar-swatch"
          :style="{ background: loadedColor }"
        />
        <span class="font-weight-bold text-truncate">{{ loadedLabel }}</span>
      </div>
      <v-spacer />
      <v-btn
        small
        class="me-2"
        :disabled="!canAct"
        @click="unloadLoaded"
      >
        <v-icon
          small
          left
        >
          $afcUnloadLane
        </v-icon>
        {{ $t('app.afc.UnloadLane') }}
      </v-btn>
      <v-btn
        small
        :disabled="!canAct"
        @click="ejectLoaded"
      >
        <v-icon
          small
          left
        >
          $afcEjectFilament
        </v-icon>
        {{ $t('app.afc.EjectFilament') }}
      </v-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'
import { encodeGcodeParamValue } from '@/util/gcode-helpers'
import { buildEndlessSpoolChains } from '@/util/afc-helpers'
import AfcLaneCard from '@/components/widgets/afc/AfcLaneCard.vue'

interface ChainLane {
  name: string
  label: string
  color: string
}

interface EndlessChain {
  lanes: ChainLane[]
  loops: boolean
}

@Component({
  components: { AfcLaneCard },
})
export default class AfcLaneCards extends Mixins(StateMixin, AfcMixin) {
  get filteredUnits (): string[] {
    return this.afcUnits
      .filter(unit => !this.afcHiddenUnits.includes(unit))
  }

  get hasAnyLanes (): boolean {
    return this.filteredUnits.some(unit => this.unitLanes(unit).length > 0)
  }

  unitName (unit: string): string {
    return unit.substring(unit.indexOf(' ') + 1)
  }

  unitLanes (unit: string): string[] {
    const unitType = unit.substring(0, unit.indexOf(' ')).replace(/_/g, '')
    const name = unit.substring(unit.indexOf(' ') + 1)

    const printer: Klipper.PrinterState = this.$typedState.printer.printer
    const unitObjectName = `AFC_${unitType} ${name}`.toLowerCase()
    const unitObjectKey = Object.keys(printer)
      .find((key): key is Klipper.AfcUnitKey => key.toLowerCase() === unitObjectName)

    if (unitObjectKey != null) {
      return printer[unitObjectKey]?.lanes ?? []
    }
    return []
  }

  laneColor (name: string): string {
    const lane = this.getAfcLaneObject(name)
    if (lane?.td1_color && this.afc?.td1_present && this.afcShowTd1Color) return `#${lane.td1_color}`
    return lane?.color || '#808080'
  }

  /*
   * Build endless-spool runout chains (experiment): laneA → laneB → …
   */
  get endlessChains (): EndlessChain[] {
    const chains = buildEndlessSpoolChains(
      this.afcLanes.map(name => ({
        name,
        runoutLane: this.getAfcLaneObject(name)?.runout_lane ?? null,
      }))
    )

    return chains.map(chain => ({
      loops: chain.loops,
      lanes: chain.lanes.map(name => ({
        name,
        label: this.$filters.prettyCase(name),
        color: this.laneColor(name),
      })),
    }))
  }

  /*
   * Loaded-lane action bar
   */
  get loadedLane (): Klipper.AfcLaneState | undefined {
    for (const laneName of this.afcLanes) {
      const lane = this.getAfcLaneObject(laneName)
      if (lane?.tool_loaded === true) return lane
    }
    return undefined
  }

  get loadedLabel (): string {
    return this.loadedLane
      ? this.$filters.prettyCase(this.loadedLane.name)
      : this.$t('app.afc.LaneCard.no_lane_loaded').toString()
  }

  get loadedColor (): string {
    const lane = this.loadedLane
    if (lane?.td1_color && this.afc?.td1_present && this.afcShowTd1Color) return `#${lane.td1_color}`
    return lane?.color || '#808080'
  }

  get canAct (): boolean {
    return (
      this.klippyReady &&
      !this.printerPrinting &&
      this.loadedLane != null
    )
  }

  unloadLoaded () {
    if (!this.canAct || !this.loadedLane) return
    this.sendGcode(`TOOL_UNLOAD LANE=${encodeGcodeParamValue(this.loadedLane.name)}`)
  }

  ejectLoaded () {
    if (!this.canAct || !this.loadedLane) return
    this.sendGcode(`LANE_UNLOAD LANE=${encodeGcodeParamValue(this.loadedLane.name)}`)
  }
}
</script>

<style scoped>
.afc-lane-cards-wrapper {
    width: 100%;
}

.lane-cards-unit-header {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 12px 4px 6px;
}

.afc-lane-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    width: 100%;
}

.lane-skeleton {
    height: 190px;
    border-radius: 12px;
    overflow: hidden;
}

.lane-skeleton :deep(.v-skeleton-loader__image) {
    height: 190px;
}

.afc-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 16px;
}

.afc-es-chains {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.07);
}

.afc-es-title {
    display: flex;
    align-items: center;
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
}

.afc-es-chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin: 2px 0;
}

.afc-es-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(127, 127, 127, 0.16);
}

.afc-es-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.afc-es-arrow {
    opacity: 0.6;
}

.afc-action-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.08);
}

.afc-action-bar--dark {
    border-color: rgba(255, 255, 255, 0.1);
}

.afc-action-bar-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.afc-action-bar-swatch {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
</style>
