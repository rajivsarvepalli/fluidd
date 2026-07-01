<template>
  <app-dialog
    v-model="show"
    :title="$t('app.afc.FilamentForLane', { name: $filters.prettyCase(name) })"
    width="460"
    :save-button-text="$t('app.afc.SetFilament')"
    :save-button-disabled="disableSetBtn"
    @save="setSpool"
  >
    <v-card-text class="pa-5">
      <!-- Live preview -->
      <div class="editor-preview mb-5">
        <div
          class="preview-disc"
          :style="{ background: color, color: contrastColor }"
        >
          <span class="preview-material text-truncate">{{ material || '—' }}</span>
        </div>
        <div class="preview-weight">
          {{ weight || 0 }} <span class="text--secondary">g</span>
        </div>
      </div>

      <!-- Fields -->
      <v-row dense>
        <v-col cols="7">
          <div class="field-label">
            {{ $t('app.afc.Material') }}
          </div>
          <v-text-field
            v-model="material"
            placeholder="ABS"
            dense
            outlined
            hide-details
          />
        </v-col>
        <v-col cols="5">
          <div class="field-label">
            {{ $t('app.afc.Weight') }}
          </div>
          <v-text-field
            v-model="weight"
            placeholder="1000"
            dense
            outlined
            type="number"
            :min="0"
            :step="1"
            suffix="g"
            hide-details
          />
        </v-col>
      </v-row>

      <!-- Color -->
      <div class="field-label mt-5 mb-2">
        {{ $t('app.afc.Color') }}
      </div>
      <div class="d-flex flex-wrap mb-3">
        <button
          v-for="swatch in swatches"
          :key="swatch"
          type="button"
          class="color-swatch"
          :class="{ 'color-swatch--selected': sameColor(swatch) }"
          :style="{ background: swatch }"
          @click="color = swatch"
        />
      </div>
      <v-color-picker
        hide-mode-switch
        mode="hexa"
        :value="color"
        width="412"
        class="afc-color-picker"
        @update:color="setColor"
      />
    </v-card-text>
  </app-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Watch, VModel } from 'vue-property-decorator'
import { TinyColor } from '@ctrl/tinycolor'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'
import { Debounce } from 'vue-debounce-decorator'
import { encodeGcodeParamValue } from '@/util/gcode-helpers'

@Component({})
export default class AfcUnitLaneFilamentDialog extends Mixins(StateMixin, AfcMixin) {
  @VModel({ type: Boolean })
  show!: boolean

  @Prop({ type: String, required: true })
  readonly name!: string

  color = '#000000'
  material = ''
  weight = 0

  readonly swatches = [
    '#202020', '#ffffff', '#e5484d', '#e8842c', '#f5c518',
    '#3fb950', '#2c83e8', '#8a5cf6', '#e25fb0', '#9b7242',
  ]

  get lane () {
    return this.getAfcLaneObject(this.name)
  }

  get currentColor (): string {
    return this.lane?.color ?? '#000000'
  }

  get currentMaterial (): string {
    return this.lane?.material ?? ''
  }

  get currentWeight (): number {
    return Math.round(this.lane?.weight ?? 0)
  }

  get contrastColor (): string {
    return new TinyColor(this.color).getLuminance() > 0.5 ? '#000000' : '#ffffff'
  }

  get disableSetBtn (): boolean {
    return (
      !this.material ||
      !this.weight ||
      !this.color
    )
  }

  sameColor (hex: string): boolean {
    return new TinyColor(hex).toHex() === new TinyColor(this.color).toHex()
  }

  @Debounce(500)
  setColor (newColor: { hex: string }) {
    this.color = newColor.hex
  }

  setSpool () {
    const gcode: string[] = []

    if (this.color !== this.currentColor) {
      const cleanedColor = this.color.substring(1)
      gcode.push(`SET_COLOR LANE=${encodeGcodeParamValue(this.name)} COLOR=${encodeGcodeParamValue(cleanedColor)}`)
    }

    if (this.material !== this.currentMaterial) {
      gcode.push(`SET_MATERIAL LANE=${encodeGcodeParamValue(this.name)} MATERIAL=${encodeGcodeParamValue(this.material)}`)
    }

    if (this.weight !== this.currentWeight) {
      gcode.push(`SET_WEIGHT LANE=${encodeGcodeParamValue(this.name)} WEIGHT=${this.weight}`)
    }

    this.sendGcode(gcode.join('\n'))

    this.show = false
  }

  @Watch('show')
  onShowChange (newValue: boolean) {
    if (!newValue) return

    this.color = this.currentColor
    this.material = this.currentMaterial
    this.weight = this.currentWeight
  }
}
</script>

<style scoped>
.editor-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.preview-disc {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.preview-material {
    max-width: 76px;
    font-size: 0.92rem;
    font-weight: 700;
    padding: 0 4px;
}

.preview-weight {
    font-size: 1.1rem;
    font-weight: 700;
}

.field-label {
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin-bottom: 4px;
}

.color-swatch {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    margin: 0 6px 6px 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
    transition: transform 0.1s ease;
}

.color-swatch:hover {
    transform: scale(1.1);
}

.color-swatch--selected {
    box-shadow: 0 0 0 2px var(--v-primary-base);
}

.afc-color-picker {
    box-shadow: none;
    max-width: 100%;
}
</style>
