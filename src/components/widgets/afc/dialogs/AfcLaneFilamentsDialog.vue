<template>
  <app-dialog
    v-model="open"
    :title="$t('app.afc.LaneCard.filaments_headline')"
    :width="820"
    :fullscreen="isMobileViewport"
    no-actions
  >
    <div
      class="afc-fil-editor"
      :class="{ 'afc-fil-editor--stacked': isMobileViewport }"
    >
      <!-- LEFT: lane selector -->
      <div class="afc-fil-selector">
        <div class="afc-fil-selector-label text--secondary">
          {{ $t('app.afc.LaneCard.select_lane_prompt') }}
        </div>

        <template v-for="(group, gi) in groups">
          <div
            v-if="showUnitHeaders"
            :key="`h-${gi}`"
            class="afc-fil-unit text--disabled"
          >
            {{ $filters.prettyCase(group.unit) }}
          </div>

          <button
            v-for="row in group.lanes"
            :key="row.name"
            type="button"
            class="afc-fil-oval"
            :class="{
              'afc-fil-oval--selected': row.name === selectedLane,
              'afc-fil-oval--empty': !row.editable,
              'afc-fil-oval--dark': $vuetify.theme.dark,
            }"
            :disabled="!row.editable"
            @click="selectLane(row.name)"
          >
            <span
              class="afc-fil-oval-swatch"
              :class="{ 'afc-fil-oval-swatch--empty': row.isEmpty }"
              :style="row.isEmpty ? undefined : { background: row.fill }"
            />
            <span class="afc-fil-oval-name text-truncate">{{ row.label }}</span>
            <span
              v-if="row.toolBadge"
              class="afc-fil-oval-tool"
            >{{ row.toolBadge }}</span>
            <v-icon
              v-if="row.isLow"
              x-small
              color="warning"
              :title="$t('app.afc.LaneCard.low_filament').toString()"
            >
              $warning
            </v-icon>
          </button>
        </template>
      </div>

      <!-- RIGHT: detail -->
      <div class="afc-fil-detail">
        <div
          v-if="!selectedLane"
          class="afc-fil-empty text--disabled"
        >
          {{ $t('app.afc.LaneCard.select_lane_prompt') }}
        </div>

        <template v-else-if="afcExistsSpoolman">
          <div class="afc-fil-detail-head">
            {{ $t('app.afc.LaneCard.spool_for', { name: selectedLabel }) }}
          </div>
          <spool-table
            :value="selectedSpoolId"
            :search.sync="search"
            @input="selectedSpoolId = $event"
          />
        </template>

        <div
          v-else
          class="afc-fil-manual"
        >
          <div class="afc-fil-detail-head mb-4">
            {{ $t('app.afc.LaneCard.spool_for', { name: selectedLabel }) }}
          </div>
          <div
            class="afc-fil-manual-swatch"
            :style="{ background: selectedFill }"
          />
          <div class="afc-fil-manual-text mt-3">
            {{ selectedSummary }}
          </div>
          <v-btn
            class="mt-4"
            color="primary"
            @click="openManualEditor"
          >
            <v-icon
              small
              left
            >
              $mmuEditGateMap
            </v-icon>
            {{ $t('app.afc.LaneCard.edit_filament') }}
          </v-btn>
        </div>
      </div>
    </div>

    <afc-unit-lane-filament-dialog
      v-if="filamentDialogLane"
      v-model="showFilamentDialog"
      :name="filamentDialogLane"
    />
  </app-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Prop, VModel, Watch } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import BrowserMixin from '@/mixins/browser'
import AfcMixin from '@/mixins/afc'
import { encodeGcodeParamValue } from '@/util/gcode-helpers'
import {
  afcResolveLaneColor,
  afcLaneColors,
  afcFillBackground,
  afcToolBadge,
  nextAssignableLane,
  type AfcLaneAssignState
} from '@/util/afc-helpers'
import SpoolTable from '@/components/widgets/spoolman/SpoolTable.vue'
import AfcUnitLaneFilamentDialog from '@/components/widgets/afc/dialogs/AfcUnitLaneFilamentDialog.vue'

interface LaneRow {
  name: string
  label: string
  unit: string
  editable: boolean
  isEmpty: boolean
  fill: string
  toolBadge: string | null
  isLow: boolean
}

interface LaneGroup {
  unit: string
  lanes: LaneRow[]
}

@Component({
  components: { SpoolTable, AfcUnitLaneFilamentDialog },
})
export default class AfcLaneFilamentsDialog extends Mixins(StateMixin, BrowserMixin, AfcMixin) {
  @VModel({ type: Boolean })
  open!: boolean

  @Prop({ type: String, default: null })
  readonly focusLane!: string | null

  selectedLane: string | null = null
  selectedSpoolId: number | null = null
  search = ''
  filamentDialogLane: string | null = null
  showFilamentDialog = false

  buildRow (name: string): LaneRow {
    const lane = this.getAfcLaneObject(name)
    const spool = lane?.spool_id
      ? this.$typedGetters['spoolman/getSpoolById'](lane.spool_id) ?? null
      : null

    const isEmpty = lane?.prep !== true && lane?.load !== true
    const color = afcResolveLaneColor({
      color: lane?.color,
      td1Color: lane?.td1_color,
      td1Present: this.afc?.td1_present === true,
      showTd1: this.afcShowTd1Color,
      spoolColor: spool?.filament?.colors?.[0],
    })
    const remainingWeight = spool?.remaining_weight ?? lane?.weight

    return {
      name,
      label: this.$filters.prettyCase(name),
      unit: lane?.unit ?? '',
      editable: !isEmpty,
      isEmpty,
      fill: afcFillBackground(afcLaneColors(color, spool?.filament?.colors)),
      toolBadge: afcToolBadge(lane?.map),
      isLow: !isEmpty && remainingWeight != null && remainingWeight <= 50,
    }
  }

  get groups (): LaneGroup[] {
    const order: string[] = []
    const byUnit: Record<string, LaneRow[]> = {}

    for (const name of this.afcLanes) {
      const row = this.buildRow(name)
      if (!(row.unit in byUnit)) {
        byUnit[row.unit] = []
        order.push(row.unit)
      }
      byUnit[row.unit].push(row)
    }

    return order.map(unit => ({ unit, lanes: byUnit[unit] }))
  }

  get showUnitHeaders (): boolean {
    return this.groups.length > 1
  }

  get assignStates (): AfcLaneAssignState[] {
    return this.afcLanes.map(name => {
      const lane = this.getAfcLaneObject(name)
      return {
        name,
        editable: lane?.prep === true || lane?.load === true,
        hasSpool: lane?.spool_id != null,
      }
    })
  }

  get selectedLabel (): string {
    return this.selectedLane ? this.$filters.prettyCase(this.selectedLane) : ''
  }

  get selectedFill (): string {
    return this.selectedLane ? this.buildRow(this.selectedLane).fill : 'transparent'
  }

  get selectedSummary (): string {
    if (!this.selectedLane) return ''
    const lane = this.getAfcLaneObject(this.selectedLane)
    const material = lane?.material || this.$t('app.afc.LaneCard.unknown').toString()
    const weight = lane?.weight != null ? `${Math.round(lane.weight)} g` : ''
    return [material, weight].filter(Boolean).join(' · ')
  }

  isEditable (name: string | null): boolean {
    if (!name) return false
    const lane = this.getAfcLaneObject(name)
    return lane?.prep === true || lane?.load === true
  }

  selectLane (name: string) {
    if (!this.isEditable(name)) return
    this.selectedLane = name
    this.selectedSpoolId = this.getAfcLaneObject(name)?.spool_id ?? null
  }

  openManualEditor () {
    if (!this.selectedLane) return
    this.filamentDialogLane = this.selectedLane
    this.showFilamentDialog = true
  }

  @Watch('open')
  onOpenChanged (value: boolean) {
    if (!value) {
      this.selectedLane = null
      this.selectedSpoolId = null
      this.search = ''
      this.filamentDialogLane = null
      this.showFilamentDialog = false
      return
    }

    const target = this.isEditable(this.focusLane)
      ? this.focusLane
      : this.afcLanes.find(name => this.isEditable(name)) ?? null

    if (target) {
      this.selectLane(target)
    } else {
      this.selectedLane = null
    }
  }

  @Watch('selectedSpoolId')
  onSelectedSpoolChanged (newVal: number | null) {
    if (this.selectedLane == null) return

    const current = this.getAfcLaneObject(this.selectedLane)?.spool_id ?? null
    if (newVal === current) return

    // AFC clears the assignment when SPOOL_ID is empty.
    this.sendGcode(`SET_SPOOL_ID LANE=${encodeGcodeParamValue(this.selectedLane)} SPOOL_ID=${newVal ?? ''}`)

    // Auto-advance to the next unassigned lane, but only when we just filled a
    // previously-empty assignment (fresh setup), never when re-assigning.
    if (current == null && newVal != null) {
      const next = nextAssignableLane(this.assignStates, this.selectedLane)
      if (next) this.$nextTick(() => this.selectLane(next))
    }
  }
}
</script>

<style scoped>
.afc-fil-editor {
    display: flex;
    align-items: stretch;
    height: 68vh;
    max-height: 68vh;
}

.afc-fil-editor--stacked {
    flex-direction: column;
    height: 100%;
    max-height: none;
}

/* selector */
.afc-fil-selector {
    flex: 0 0 190px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    overflow-y: auto;
    border-inline-end: 1px solid rgba(127, 127, 127, 0.18);
}

.afc-fil-editor--stacked .afc-fil-selector {
    flex: 0 0 auto;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    border-inline-end: none;
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
}

.afc-fil-selector-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.afc-fil-editor--stacked .afc-fil-selector-label {
    display: none;
}

.afc-fil-unit {
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
}

.afc-fil-oval {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 22px;
    border: 1px solid rgba(127, 127, 127, 0.28);
    background: transparent;
    cursor: pointer;
    outline: none;
    flex: 0 0 auto;
    transition: border-color 0.15s ease, background 0.15s ease;
}

.afc-fil-oval:hover:not(:disabled) {
    border-color: rgba(127, 127, 127, 0.6);
}

.afc-fil-oval--selected {
    border-color: var(--v-primary-base);
    background: rgba(76, 139, 245, 0.12);
}

.afc-fil-oval--empty {
    opacity: 0.5;
    cursor: default;
    border-style: dashed;
}

.afc-fil-oval-swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.afc-fil-oval-swatch--empty {
    box-shadow: none;
    border: 2px dashed rgba(127, 127, 127, 0.5);
}

.afc-fil-oval-name {
    font-size: 0.84rem;
    font-weight: 600;
}

.afc-fil-oval-tool {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 6px;
    background: rgba(127, 127, 127, 0.2);
}

/* detail */
.afc-fil-detail {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.afc-fil-detail :deep(.file-system) {
    height: auto;
    flex: 1 1 auto;
    min-height: 0;
}

.afc-fil-detail-head {
    font-size: 0.92rem;
    font-weight: 700;
    padding: 12px 14px 6px;
}

.afc-fil-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 0.9rem;
}

.afc-fil-manual {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
}

.afc-fil-manual-swatch {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.afc-fil-manual-text {
    font-size: 0.95rem;
    font-weight: 600;
}
</style>
