<template>
  <div
    v-if="show"
    class="afc-toolchange-strip"
    :class="{ 'afc-toolchange-strip--dark': $vuetify.theme.dark }"
  >
    <v-icon
      small
      class="me-2"
    >
      $mmuChangeTool
    </v-icon>
    <span class="afc-toolchange-label">
      {{ $t('app.afc.LaneCard.toolchange') }}
      <strong>{{ afcCurrentToolchange }} / {{ afcNumberOfToolchanges }}</strong>
    </span>
    <v-progress-linear
      :value="progress"
      height="6"
      rounded
      class="mx-3 afc-toolchange-progress"
    />
    <v-chip
      v-if="nextLane"
      x-small
      label
      class="afc-toolchange-next"
    >
      <span
        class="afc-toolchange-swatch"
        :style="{ background: nextLaneColor }"
      />
      {{ $t('app.afc.LaneCard.next') }} → {{ $filters.prettyCase(nextLane) }}
    </v-chip>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'

@Component({})
export default class AfcToolchangeStrip extends Mixins(StateMixin, AfcMixin) {
  get isActive (): boolean {
    return this.printerPrinting || this.afcCurrentState !== 'Idle'
  }

  get show (): boolean {
    return (
      this.afc != null &&
      this.isActive &&
      this.afcNumberOfToolchanges > 0
    )
  }

  get progress (): number {
    if (this.afcNumberOfToolchanges <= 0) return 0
    return Math.min(100, (this.afcCurrentToolchange / this.afcNumberOfToolchanges) * 100)
  }

  get nextLane (): string | null {
    return this.afcNextLane
  }

  get nextLaneColor (): string {
    if (!this.nextLane) return '#808080'
    const lane = this.getAfcLaneObject(this.nextLane)
    if (lane?.td1_color && this.afc?.td1_present && this.afcShowTd1Color) return `#${lane.td1_color}`
    return lane?.color || '#808080'
  }
}
</script>

<style scoped>
.afc-toolchange-strip {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    margin-bottom: 8px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.08);
}

.afc-toolchange-strip--dark {
    border-color: rgba(255, 255, 255, 0.1);
}

.afc-toolchange-label {
    font-size: 0.82rem;
    white-space: nowrap;
}

.afc-toolchange-progress {
    flex: 1 1 auto;
    min-width: 40px;
}

.afc-toolchange-next {
    flex: 0 0 auto;
}

.afc-toolchange-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-inline-end: 4px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
</style>
