<template>
  <app-dialog
    v-model="open"
    :title="$t('app.afc.InfiniteSpoolHeadline')"
    width="440"
    no-actions
  >
    <v-card-text class="pt-4">
      <p class="text-body-2 text--secondary mb-4">
        {{ $t('app.afc.InfiniteSpoolDescription', { name: $filters.prettyCase(name) }) }}
      </p>

      <div class="backup-options">
        <button
          type="button"
          class="backup-option backup-option--none"
          :class="optionClasses('NONE')"
          @click="setRunout('NONE')"
        >
          <v-icon
            class="backup-option-icon"
            :color="runoutLane === 'NONE' ? 'primary' : undefined"
          >
            $cancel
          </v-icon>
          <span class="backup-option-name">{{ $t('app.afc.LaneLoadedNone') }}</span>
        </button>

        <button
          v-for="lane in candidateLanes"
          :key="lane.name"
          type="button"
          class="backup-option"
          :class="optionClasses(lane.name)"
          @click="setRunout(lane.name)"
        >
          <span
            class="backup-option-swatch"
            :style="{ background: lane.color }"
          />
          <span class="backup-option-text">
            <span class="backup-option-name">{{ lane.label }}</span>
            <span
              v-if="lane.material"
              class="backup-option-material text--secondary"
            >{{ lane.material }}</span>
          </span>
          <v-icon
            v-if="runoutLane === lane.name"
            small
            color="primary"
            class="ms-auto"
          >
            $check
          </v-icon>
        </button>
      </div>
    </v-card-text>
  </app-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Prop, VModel } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'
import { encodeGcodeParamValue } from '@/util/gcode-helpers'

interface BackupLane {
  name: string
  label: string
  color: string
  material: string
}

@Component({})
export default class AfcUnitLaneInfiniteDialog extends Mixins(StateMixin, AfcMixin) {
  @VModel({ type: Boolean })
  open?: boolean

  @Prop({ type: String, required: true })
  readonly name!: string

  get lane (): Klipper.AfcLaneState | undefined {
    return this.getAfcLaneObject(this.name)
  }

  get runoutLane (): string {
    return this.lane?.runout_lane ?? 'NONE'
  }

  get candidateLanes (): BackupLane[] {
    const lanes: BackupLane[] = []

    for (const laneName of this.afcLanes) {
      if (laneName === this.name) continue

      const lane = this.getAfcLaneObject(laneName)

      if (lane?.prep === true && lane.load === true) {
        lanes.push({
          name: lane.name,
          label: this.$filters.prettyCase(lane.name),
          color: lane.color || '#808080',
          material: lane.material ?? '',
        })
      }
    }

    return lanes.sort((a, b) => a.name.localeCompare(b.name))
  }

  optionClasses (laneName: string) {
    return {
      'backup-option--selected': this.runoutLane === laneName,
      'backup-option--dark': this.$vuetify.theme.dark,
    }
  }

  setRunout (newLane: string) {
    if (newLane !== this.runoutLane) {
      this.sendGcode(`SET_RUNOUT LANE=${encodeGcodeParamValue(this.name)} RUNOUT=${encodeGcodeParamValue(newLane)}`)
    }

    this.open = false
  }
}
</script>

<style scoped>
.backup-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.backup-option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    background: rgba(127, 127, 127, 0.06);
    text-align: start;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
    outline: none;
}

.backup-option--dark {
    border-color: rgba(255, 255, 255, 0.12);
}

.backup-option:hover {
    background: rgba(127, 127, 127, 0.14);
}

.backup-option:active {
    transform: scale(0.99);
}

.backup-option--selected {
    border-color: var(--v-primary-base);
    box-shadow: 0 0 0 1px var(--v-primary-base);
}

.backup-option-swatch {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.backup-option-icon {
    width: 26px;
}

.backup-option-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}

.backup-option-name {
    font-weight: 600;
}

.backup-option-material {
    font-size: 0.78rem;
}
</style>
