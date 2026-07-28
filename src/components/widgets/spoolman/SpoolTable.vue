<template>
  <div class="spool-table-wrap">
    <v-toolbar dense>
      <v-spacer />

      <app-column-picker
        key-name="spoolman"
        :headers="configurableHeaders"
      />

      <v-text-field
        v-model="searchModel"
        outlined
        dense
        single-line
        hide-details
        spellcheck="false"
        append-icon="$magnify"
        style="max-width: 360px"
        class="ml-1"
        @focus="$event.target.select()"
      />
    </v-toolbar>

    <div class="file-system">
      <v-data-table
        :items="availableSpools"
        :headers="headers"
        :search="search"
        :custom-filter="filterResults"
        :no-data-text="$t('app.file_system.msg.not_found')"
        :no-results-text="$t('app.file_system.msg.not_found')"
        :sort-by="sortOrder.key ?? undefined"
        :sort-desc="sortOrder.desc ?? undefined"
        item-key="id"
        mobile-breakpoint="0"
        class="spool-table"
        hide-default-footer
        disable-pagination
        fixed-header
        @update:sort-by="handleSortOrderKeyChange"
        @update:sort-desc="handleSortOrderDescChange"
      >
        <template #item="{ headers: rowHeaders, item }">
          <app-data-table-row
            :key="item.id"
            :headers="rowHeaders"
            :item="item"
            :is-selected="item.id === selectedSpoolId"
            @click.prevent="toggle(item.id)"
          >
            <template #[`item.select`]>
              <v-radio-group
                :value="selectedSpoolId"
                class="ma-0 pa-0 d-inline-flex"
                hide-details
              >
                <v-radio
                  :value="item.id"
                  :ripple="false"
                  @click.stop="toggle(item.id)"
                />
              </v-radio-group>
            </template>

            <template #[`item.filament_name`]>
              <div class="d-flex my-1">
                <v-progress-circular
                  :rotate="-90"
                  :size="44"
                  :width="3"
                  :value="item.remaining_weight / item.initial_weight * 100"
                  color="primary"
                  class="mr-4 flex-column"
                >
                  <v-icon
                    :color="getSpoolColor(item)"
                    size="42"
                    class="spool-icon"
                  >
                    $filament
                  </v-icon>
                </v-progress-circular>

                <div class="flex-column">
                  <div class="flex-row">
                    {{ item.filament_name }}
                  </div>
                  <div class="flex-row">
                    <small v-if="remainingFilamentUnit === 'weight'">
                      <b>{{ $filters.getReadableWeightString(item.remaining_weight) }}</b>
                      / {{ $filters.getReadableWeightString(item.initial_weight) }}
                    </small>
                    <small v-else-if="remainingFilamentUnit === 'length'">
                      <b>{{ $filters.getReadableLengthString(item.remaining_length) }}</b>
                      / {{ $filters.getReadableLengthString(item.initial_length) }}
                    </small>
                  </div>
                </div>
              </div>
            </template>

            <template #[`item-value.afc_loaded_lane`]="{ value }">
              <v-chip
                v-if="value != null"
                color="primary"
                small
              >
                {{ $filters.prettyCase(value ?? '') }}
              </v-chip>
            </template>

            <template #[`item-value.initial_weight`]="{ value }">
              {{ $filters.getReadableWeightString(value) }}
            </template>

            <template #[`item-value.used_weight`]="{ value }">
              {{ $filters.getReadableWeightString(value) }}
            </template>

            <template #[`item-value.remaining_weight`]="{ value }">
              {{ $filters.getReadableWeightString(value) }}
            </template>

            <template #[`item-value.initial_length`]="{ value }">
              {{ $filters.getReadableLengthString(value) }}
            </template>

            <template #[`item-value.used_length`]="{ value }">
              {{ $filters.getReadableLengthString(value) }}
            </template>

            <template #[`item-value.remaining_length`]="{ value }">
              {{ $filters.getReadableLengthString(value) }}
            </template>

            <template #[`item-value.price`]="{ value }">
              {{ $filters.getReadableCurrencyString(value, currency ?? '') }}
            </template>

            <template #[`item-value.filament.density`]="{ value }">
              {{ value }} g/cm³
            </template>

            <template #[`item-value.filament.diameter`]="{ value }">
              {{ value }} mm
            </template>

            <template #[`item-value.filament.settings_extruder_temp`]="{ value }">
              {{ value }}<small>°C</small>
            </template>

            <template #[`item-value.filament.settings_bed_temp`]="{ value }">
              {{ value }}<small>°C</small>
            </template>

            <template #[`item.first_used`]="{ value }">
              <v-tooltip
                bottom
                :disabled="!value"
              >
                <template #activator="{ on, attrs }">
                  <span
                    v-bind="attrs"
                    v-on="on"
                  >
                    {{
                      value
                        ? $filters.formatRelativeTimeToNow(value)
                        : $tc('app.setting.label.never')
                    }}
                  </span>
                </template>
                <span>{{ value ? $filters.formatDateTime(value) : null }}</span>
              </v-tooltip>
            </template>

            <template #[`item.last_used`]="{ value }">
              <v-tooltip
                bottom
                :disabled="!value"
              >
                <template #activator="{ on, attrs }">
                  <span
                    v-bind="attrs"
                    v-on="on"
                  >
                    {{
                      value
                        ? $filters.formatRelativeTimeToNow(value)
                        : $tc('app.setting.label.never')
                    }}
                  </span>
                </template>
                <span>{{ value ? $filters.formatDateTime(value) : null }}</span>
              </v-tooltip>
            </template>

            <template #[`item-value.filament.colors`]="{ value }">
              <app-data-table-cell-colors :colors="value" />
            </template>
          </app-data-table-row>
        </template>
      </v-data-table>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import AfcMixin from '@/mixins/afc'
import type { Spool } from '@/store/spoolman/types'
import type { AppDataTableHeader } from '@/types'
import type { DataTableHeader } from 'vuetify'
import type { SpoolmanRemainingFilamentUnit } from '@/store/config/types'

type SpoolWithAfcLoadedLane = Spool & {
  afc_loaded_lane?: string
}

@Component({})
export default class SpoolTable extends Mixins(StateMixin, AfcMixin) {
  @Prop({ type: Number, default: null })
  readonly value!: number | null

  @Prop({ type: String, default: '' })
  readonly search!: string

  get selectedSpoolId (): number | null {
    return this.value
  }

  get searchModel (): string {
    return this.search
  }

  set searchModel (val: string) {
    this.$emit('update:search', val)
  }

  toggle (id: number) {
    this.$emit('input', this.selectedSpoolId === id ? null : id)
  }

  get availableSpools (): SpoolWithAfcLoadedLane[] {
    const availableSpools: Spool[] = this.$typedGetters['spoolman/getAvailableSpools']

    const afcLoadedSpools = this.afc != null
      ? this.afcLoadedSpools
      : {}

    return availableSpools
      .filter(x => !x.archived)
      .map(spool => ({
        ...spool,
        afc_loaded_lane: afcLoadedSpools[spool.id]
      } satisfies SpoolWithAfcLoadedLane))
  }

  get currency (): string | null {
    return this.$typedState.spoolman.currency
  }

  get configurableHeaders (): AppDataTableHeader[] {
    const afcHeaders: AppDataTableHeader[] = this.afc != null
      ? [
          {
            text: this.$tc('app.afc.LaneLoaded'),
            value: 'afc_loaded_lane',
            cellClass: 'text-no-wrap'
          }
        ]
      : []

    const headers: AppDataTableHeader[] = [
      {
        text: this.$tc('app.spoolman.label.id'),
        value: 'id',
        cellClass: 'text-no-wrap'
      },
      ...afcHeaders,
      {
        text: this.$tc('app.spoolman.label.material'),
        value: 'filament.material',
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.initial_weight'),
        value: 'initial_weight',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.used_weight'),
        value: 'used_weight',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.remaining_weight'),
        value: 'remaining_weight',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.initial_length'),
        value: 'initial_length',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.used_length'),
        value: 'used_length',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.remaining_length'),
        value: 'remaining_length',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.price'),
        value: 'price',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.lot_nr'),
        value: 'lot_nr',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.density'),
        value: 'filament.density',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.diameter'),
        value: 'filament.diameter',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.extruder_temp'),
        value: 'filament.settings_extruder_temp',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.bed_temp'),
        value: 'filament.settings_bed_temp',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.colors'),
        value: 'filament.colors',
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.location'),
        value: 'location',
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.comment'),
        value: 'comment',
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.first_used'),
        value: 'first_used',
        visible: false,
        cellClass: 'text-no-wrap'
      },
      {
        text: this.$tc('app.spoolman.label.last_used'),
        value: 'last_used',
        cellClass: 'text-no-wrap'
      }
    ]

    const mergedTableHeaders: AppDataTableHeader[] = this.$typedGetters['config/getMergedTableHeaders'](headers, 'spoolman')

    return mergedTableHeaders
  }

  get headers (): DataTableHeader[] {
    return [
      {
        text: '',
        value: 'select',
        sortable: false,
        align: 'center',
        width: 56,
        class: 'pe-0',
        cellClass: 'pe-0'
      },
      {
        text: this.$tc('app.spoolman.label.filament_name'),
        value: 'filament_name'
      },
      ...this.configurableHeaders
        .filter(header => header.visible !== false)
    ]
  }

  get remainingFilamentUnit (): SpoolmanRemainingFilamentUnit {
    return this.$typedState.config.uiSettings.spoolman.remainingFilamentUnit
  }

  get sortOrder () {
    return this.$typedState.config.uiSettings.spoolman.selectionDialogSortOrder
  }

  handleSortOrderKeyChange (value?: string) {
    this.$typedDispatch('config/saveByPath', {
      path: 'uiSettings.spoolman.selectionDialogSortOrder.key',
      value: value ?? null,
      server: true
    })
  }

  handleSortOrderDescChange (value?: boolean) {
    this.$typedDispatch('config/saveByPath', {
      path: 'uiSettings.spoolman.selectionDialogSortOrder.desc',
      value: value ?? null,
      server: true
    })
  }

  filterResults (value: string, query: string, item: Spool): boolean {
    query = query.toLowerCase()
    return [item.id, item.comment, item.filament.name, item.filament.material, item.filament.vendor?.name]
      .some(val => val?.toString().toLowerCase().includes(query))
  }

  getSpoolColor (spool?: Spool) {
    return spool?.filament.color_hex ?? (this.$vuetify.theme.dark ? '#fff' : '#000')
  }
}
</script>

<style lang="scss" scoped>
  // Layout-transparent: toolbar + table behave as direct children of the host,
  // preserving the original dialog height/scroll behaviour after extraction.
  .spool-table-wrap {
    display: contents;
  }

  // Vuetify's .v-toolbar is flex: 1 1 auto — inside a fixed-height flex column
  // host it stretches and leaves dead space under the search field.
  .spool-table-wrap > .v-toolbar {
    flex: 0 0 auto;
  }

  .file-system,
  .file-system :deep(.v-data-table) {
    display: flex;
    flex-direction: column;
    overflow: auto;
    height: 100%;
  }

  .spool-table :deep(tbody tr) {
    cursor: pointer;
  }

  .spool-table :deep(tbody tr:hover > td) {
    background-color: rgba(128, 128, 128, 0.08);
  }

  .spool-table :deep(tbody tr.v-data-table__selected > td) {
    background-color: rgba(128, 128, 128, 0.18);
  }

  .spool-table :deep(tbody tr.v-data-table__selected > td:first-child) {
    box-shadow: inset 4px 0 0 0 var(--v-primary-base);
  }
</style>
