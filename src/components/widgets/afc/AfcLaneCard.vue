<template>
  <div
    class="afc-lane-card"
    :class="cardClasses"
    :style="cardStyle"
  >
    <div class="lane-card-header">
      <div class="lane-card-title text-truncate">
        {{ laneName }}
      </div>
      <v-menu
        bottom
        left
        offset-y
        transition="slide-y-transition"
      >
        <template #activator="{ on, attrs }">
          <v-btn
            icon
            x-small
            class="lane-card-menu-btn"
            v-bind="attrs"
            @click.stop
            v-on="on"
          >
            <v-icon small>
              $dots
            </v-icon>
          </v-btn>
        </template>

        <v-list dense>
          <v-list-item
            v-for="(item, i) in menuItems"
            :key="i"
            :disabled="item.disabled && item.disabled()"
            @click="runMenuItem(item)"
          >
            <v-list-item-icon class="me-2">
              <v-icon small>
                {{ item.icon }}
              </v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>{{ item.label }}</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div
      v-if="toolBadge || backupText"
      class="lane-card-tags"
    >
      <span
        v-if="toolBadge"
        class="lane-card-tool"
      >{{ toolBadge }}</span>
      <span
        v-if="backupText"
        class="lane-card-backup"
      >
        <v-icon x-small>$afcIconInfinity</v-icon>{{ backupText }}
      </span>
    </div>

    <!-- Vertical spool bar -->
    <div class="lane-card-bar-wrap">
      <div
        class="lane-card-bar"
        :class="{ 'lane-card-bar--empty': !showInfo }"
      >
        <div
          v-if="showInfo"
          class="lane-card-bar-fill"
          :style="barFillStyle"
        />
        <div
          v-if="showInfo && percent >= 0"
          class="lane-card-bar-pct"
          :style="{ color: percentTextColor }"
        >
          {{ percent }}%
        </div>
        <v-icon
          v-else-if="!showInfo"
          class="lane-card-bar-empty-icon"
        >
          $close
        </v-icon>
      </div>
    </div>

    <div class="lane-card-meta">
      <div
        class="lane-card-status"
        :style="{ color: statusBadge.color }"
      >
        <v-progress-circular
          v-if="statusBadge.spinner"
          indeterminate
          :size="12"
          :width="2"
          :color="statusBadge.color"
          class="me-1"
        />
        <v-icon
          v-else-if="statusBadge.printing"
          x-small
          class="me-1 lane-card-pulse"
          :color="statusBadge.color"
        >
          $circle
        </v-icon>
        {{ statusBadge.text }}
      </div>
      <div class="lane-card-detail text-truncate">
        <template v-if="showInfo">
          {{ detailText }}
        </template>
        <span
          v-else
          class="text--disabled"
        >{{ $t('app.afc.LaneCard.cannot_select') }}</span>
      </div>
    </div>

    <afc-unit-lane-filament-dialog
      v-model="showFilamentDialog"
      :name="name"
    />
    <afc-unit-lane-infinite-dialog
      v-model="showInfiniteDialog"
      :name="name"
    />
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Watch } from 'vue-property-decorator'
import { TinyColor } from '@ctrl/tinycolor'
import StateMixin from '@/mixins/state'
import BrowserMixin from '@/mixins/browser'
import AfcMixin from '@/mixins/afc'
import { encodeGcodeParamValue } from '@/util/gcode-helpers'
import { getAfcLaneStatus, computeSpoolPercent, type AfcLaneStatusKey } from '@/util/afc-helpers'
import type { Spool, SpoolSelectionDialogState } from '@/store/spoolman/types'
import AfcUnitLaneFilamentDialog from '@/components/widgets/afc/dialogs/AfcUnitLaneFilamentDialog.vue'
import AfcUnitLaneInfiniteDialog from '@/components/widgets/afc/dialogs/AfcUnitLaneInfiniteDialog.vue'

type MenuAction =
  | { kind: 'open-filament' }
  | { kind: 'open-backup' }
  | { kind: 'gcode', command: string }

type MenuItem = {
  icon: string
  label: string
  action: MenuAction
  disabled?: () => boolean
}

@Component({
  components: { AfcUnitLaneFilamentDialog, AfcUnitLaneInfiniteDialog },
})
export default class AfcLaneCard extends Mixins(StateMixin, BrowserMixin, AfcMixin) {
  @Prop({ type: String, required: true })
  readonly name!: string

  showFilamentDialog = false
  showInfiniteDialog = false
  spoolmanSelection = false

  get lane (): Klipper.AfcLaneState | undefined {
    return this.getAfcLaneObject(this.name)
  }

  get isCurrent (): boolean {
    return this.name === this.afcCurrentLane?.name
  }

  get toolLoaded (): boolean {
    return this.lane?.tool_loaded === true
  }

  get hasFilament (): boolean {
    return this.lane?.load === true
  }

  get prepOnly (): boolean {
    return this.lane?.prep === true && this.lane?.load !== true
  }

  get isEmpty (): boolean {
    return this.lane?.prep !== true && this.lane?.load !== true
  }

  get showInfo (): boolean {
    return this.hasFilament
  }

  // Lane is eligible for a tool change (Select)
  get canChangeTool (): boolean {
    return (
      this.klippyReady &&
      !this.printerPrinting &&
      this.hasFilament &&
      !this.toolLoaded &&
      !this.isCurrent
    )
  }

  get laneName (): string {
    return this.$filters.prettyCase(this.name)
  }

  get toolBadge (): string | null {
    const map = this.lane?.map
    if (map == null || map.length === 0) return null
    const tools = Array.isArray(map) ? map : [map]
    return tools.map(t => t.toUpperCase()).join(' ')
  }

  get backupText (): string | null {
    if (!this.afcShowLaneInfinite || !this.showInfo) return null
    const runout = this.lane?.runout_lane
    if (!runout || runout === 'NONE') return null
    return this.$filters.prettyCase(runout)
  }

  /*
   * Spoolman / lane filament info
   */
  get spoolId (): number | undefined {
    return this.lane?.spool_id ?? undefined
  }

  get spool (): Spool | null {
    if (!this.spoolId) return null
    return this.$typedGetters['spoolman/getSpoolById'](this.spoolId) ?? null
  }

  get color (): string {
    if (this.afc?.td1_present && this.lane?.td1_color && this.afcShowTd1Color) {
      return `#${this.lane.td1_color}`
    }
    return this.lane?.color || '#808080'
  }

  /*
   * Multi-color support (Spoolman multi_color_hexes / colors)
   */
  get colors (): string[] {
    const spoolColors = this.spool?.filament?.colors
    if (spoolColors && spoolColors.length > 1) return spoolColors
    return [this.color]
  }

  get fillBackground (): string {
    if (this.colors.length > 1) {
      return `linear-gradient(to top, ${this.colors.join(', ')})`
    }
    return this.color
  }

  get material (): string {
    return this.spool?.filament?.material ?? this.lane?.material ?? this.$t('app.afc.LaneCard.unknown').toString()
  }

  get filamentName (): string | undefined {
    return this.spool?.filament?.name || this.lane?.filament_name || undefined
  }

  get detailText (): string {
    const parts: string[] = [this.material]
    if (this.remainingWeight != null) parts.push(`${Math.round(this.remainingWeight)} g`)
    return parts.filter(Boolean).join(' · ')
  }

  get remainingWeight (): number | undefined {
    return this.spool?.remaining_weight ?? this.lane?.weight
  }

  get fullWeight (): number | undefined {
    return this.spool?.initial_weight ?? this.lane?.initial_weight
  }

  get percent (): number {
    return computeSpoolPercent(this.remainingWeight, this.fullWeight)
  }

  get statusKey (): AfcLaneStatusKey {
    return getAfcLaneStatus({
      status: this.lane?.status ?? null,
      load: this.lane?.load === true,
      prep: this.lane?.prep === true,
      toolLoaded: this.toolLoaded,
      isCurrent: this.isCurrent,
      printing: this.printerPrinting,
      errorState: this.afcErrorState,
    })
  }

  get statusBadge (): { text: string, color: string, printing: boolean, spinner?: boolean } {
    const green = '#2e9d4f'
    const grey = '#9e9e9e'
    const amber = '#e8842c'
    const blue = '#2c83e8'
    const red = '#e5484d'

    switch (this.statusKey) {
      case 'error':
        return { text: this.$t('app.afc.Error').toString(), color: red, printing: false }
      case 'loading':
        return { text: this.$t('app.afc.Loading').toString(), color: blue, printing: false, spinner: true }
      case 'unloading':
        return { text: this.$t('app.afc.Unloading').toString(), color: amber, printing: false, spinner: true }
      case 'empty':
        return { text: this.$t('app.afc.Empty').toString(), color: grey, printing: false }
      case 'prep':
        return { text: this.$t('app.afc.LaneCard.prep').toString(), color: amber, printing: false }
      case 'printing':
        return { text: this.$t('app.afc.Printing').toString(), color: blue, printing: true }
      case 'loaded':
        return { text: this.$t('app.afc.LaneCard.loaded').toString(), color: green, printing: false }
      default:
        return { text: this.$t('app.afc.LaneCard.ready').toString(), color: green, printing: false }
    }
  }

  /*
   * Styling
   */
  get accentColor (): string {
    if (!this.showInfo) return this.$vuetify.theme.dark ? '#4a4a4a' : '#d0d0d0'
    return this.color
  }

  get cardClasses () {
    return {
      'lane-card--loaded': this.toolLoaded,
      'lane-card--empty': !this.showInfo,
      'lane-card--dark': this.$vuetify.theme.dark,
    }
  }

  get cardStyle () {
    return { '--lane-accent': this.accentColor }
  }

  get barFillStyle () {
    // percent === -1 means no weight data is available (neither from Spoolman
    // nor from the lane itself) — show the bar at a neutral 50% height so it
    // doesn't mislead the user into thinking the spool is full or empty.
    const pct = this.percent >= 0 ? this.percent : 50
    return {
      height: `${Math.max(pct, 4)}%`,
      background: this.fillBackground,
      opacity: this.percent < 0 ? '0.35' : '1',
    }
  }

  get percentTextColor (): string {
    // Contrast against the fill when the bar is mostly full
    if (this.percent >= 55) {
      return new TinyColor(this.color).getLuminance() > 0.5 ? '#000000' : '#ffffff'
    }
    return this.$vuetify.theme.dark ? '#e0e0e0' : '#404040'
  }

  /*
   * Interaction
   */
  get menuItems (): MenuItem[] {
    return [
      {
        icon: '$afcLoadLane',
        label: this.$t('app.afc.LaneCard.select').toString(),
        action: { kind: 'gcode', command: 'CHANGE_TOOL' },
        disabled: () => !this.canChangeTool,
      },
      {
        icon: '$afcUnloadLane',
        label: this.$t('app.afc.UnloadLane').toString(),
        action: { kind: 'gcode', command: 'TOOL_UNLOAD' },
        disabled: () => !this.klippyReady || this.printerPrinting || !this.toolLoaded,
      },
      {
        icon: '$afcEjectFilament',
        label: this.$t('app.afc.EjectFilament').toString(),
        action: { kind: 'gcode', command: 'LANE_UNLOAD' },
        disabled: () => !this.klippyReady || this.printerPrinting || this.toolLoaded || this.isEmpty,
      },
      {
        icon: '$mmuEditGateMap',
        label: this.$t('app.afc.LaneCard.edit_filament').toString(),
        action: { kind: 'open-filament' },
        disabled: () => this.isEmpty,
      },
      {
        icon: '$afcIconInfinity',
        label: this.$t('app.afc.LaneCard.edit_backup').toString(),
        action: { kind: 'open-backup' },
        disabled: () => !this.hasFilament,
      },
    ]
  }

  runMenuItem (item: MenuItem) {
    if (item.disabled && item.disabled()) return

    switch (item.action.kind) {
      case 'gcode':
        this.sendGcode(`${item.action.command} LANE=${encodeGcodeParamValue(this.name)}`)
        break
      case 'open-filament':
        this.openFilamentEdit()
        break
      case 'open-backup':
        this.showInfiniteDialog = true
        break
    }
  }

  openFilamentEdit () {
    if (this.afcExistsSpoolman) {
      this.spoolmanSelection = true
      this.$typedCommit('spoolman/setDialogState', {
        show: true,
        spoolSelectionOnly: true,
        selectedSpoolId: this.spoolId,
      })
      return
    }
    this.showFilamentDialog = true
  }

  @Watch('$typedState.spoolman.dialog')
  onSpoolmanChanged (dialog: SpoolSelectionDialogState) {
    if (!dialog.show && this.spoolmanSelection) {
      this.spoolmanSelection = false
      if (dialog.selectedSpoolId !== this.spoolId) {
        this.sendGcode(`SET_SPOOL_ID LANE=${encodeGcodeParamValue(this.name)} SPOOL_ID=${dialog.selectedSpoolId ?? ''}`)
      }
    }
  }
}
</script>

<style scoped>
.afc-lane-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 8px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    outline: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.lane-card--dark {
    background: #2c2c2e;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.lane-card--loaded {
    border-color: var(--lane-accent);
    box-shadow: 0 0 0 2px var(--lane-accent);
}

.lane-card--empty {
    opacity: 0.72;
}

.lane-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
}

.lane-card-title {
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.1;
}

.lane-card-menu-btn {
    opacity: 0.6;
}

.lane-card-menu-btn:hover {
    opacity: 1;
}

.lane-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 18px;
}

.lane-card-tool {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(127, 127, 127, 0.18);
}

.lane-card-backup {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.68rem;
    font-weight: 600;
    opacity: 0.8;
}

.lane-card-bar-wrap {
    display: flex;
    justify-content: center;
    padding: 2px 0;
}

.lane-card-bar {
    position: relative;
    width: 46px;
    height: 96px;
    border-radius: 8px;
    background: rgba(127, 127, 127, 0.16);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.lane-card-bar--empty {
    border: 2px dashed rgba(127, 127, 127, 0.4);
    background: transparent;
    box-shadow: none;
}

.lane-card-bar-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0 0 6px 6px;
    transition: height 0.45s ease;
}

.lane-card-bar-pct {
    position: relative;
    z-index: 1;
    font-size: 0.74rem;
    font-weight: 700;
}

.lane-card-bar-empty-icon {
    opacity: 0.4;
}

.lane-card-meta {
    text-align: center;
}

.lane-card-status {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-height: 1em;
}

.lane-card-detail {
    font-size: 0.74rem;
    font-weight: 500;
    opacity: 0.85;
}

.lane-card-pulse {
    animation: lane-card-pulse 1.4s ease-in-out infinite;
}

@keyframes lane-card-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
    .afc-lane-card {
        transition: none;
    }

    .lane-card-bar-fill {
        transition: none;
    }

    .lane-card-pulse {
        animation: none;
    }
}
</style>
