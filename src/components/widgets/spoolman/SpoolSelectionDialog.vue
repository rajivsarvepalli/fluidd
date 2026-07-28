<template>
  <app-dialog
    v-model="open"
    scrollable
    :max-width="$vuetify.breakpoint.mdAndDown ? '90vw' : '75vw'"
    :title="$tc('app.spoolman.title.spool_selection', targetMacro ? 2 : 1, { macro: targetMacro?.toUpperCase() })"
    title-shadow
  >
    <template #menu>
      <v-menu
        v-if="availableCameras.length > 1"
        left
        offset-y
        transition="slide-y-transition"
      >
        <template #activator="{ on, attrs, value }">
          <app-btn
            v-bind="attrs"
            small
            class="me-1 my-1"
            v-on="on"
          >
            <v-icon
              class="mr-1"
              small
            >
              $camera
            </v-icon>
            {{ $t('app.spoolman.btn.scan_code') }}
            <v-icon
              small
              class="ml-1"
              :class="{ 'rotate-180': value }"
            >
              $chevronDown
            </v-icon>
          </app-btn>
        </template>
        <v-list dense>
          <v-list-item
            v-for="camera in availableCameras"
            :key="camera.uid"
            @click="cameraScanSource = camera.uid"
          >
            <v-list-item-icon>
              <v-icon>
                $camera
              </v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>
                {{ camera.name }}
              </v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-menu>

      <app-btn
        v-else-if="availableCameras.length"
        small
        class="me-1 my-1"
        @click="cameraScanSource = availableCameras[0].uid"
      >
        <v-icon
          class="mr-1"
          small
        >
          $camera
        </v-icon>
        {{ $t('app.spoolman.btn.scan_code') }}
      </app-btn>
    </template>

    <spool-table
      :value="selectedSpoolId"
      :search.sync="search"
      @input="selectedSpoolId = $event"
    />

    <template #actions>
      <v-spacer v-if="isMobileViewport" />

      <app-btn
        v-if="spoolmanURL"
        :href="spoolmanURL"
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        text
        type="button"
      >
        {{ $t('app.spoolman.btn.manage_spools') }}
      </app-btn>

      <v-spacer v-if="!isMobileViewport" />

      <app-btn
        text
        color="warning"
        @click="open = false"
      >
        {{ $t('app.general.btn.cancel') }}
      </app-btn>
      <app-btn
        color="primary"
        @click="handleSelectSpool"
      >
        {{
          filename
            ? $t('app.general.btn.print')
            : $tc('app.spoolman.btn.select', targetMacro ? 2 : 1, { macro: targetMacro })
        }}
      </app-btn>
    </template>

    <QRReader
      v-if="cameraScanSource"
      v-model="cameraScanSource"
      @detected="handleQRCodeDetected"
    />
  </app-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import { SocketActions } from '@/api/socketActions'
import type { Spool } from '@/store/spoolman/types'
import BrowserMixin from '@/mixins/browser'
import QRReader from '@/components/widgets/spoolman/QRReader.vue'
import SpoolTable from '@/components/widgets/spoolman/SpoolTable.vue'
import QrScanner from 'qr-scanner'
import getFilePaths from '@/util/get-file-paths'
import type { AppFileWithMeta } from '@/store/files/types'

@Component({
  components: {
    QRReader,
    SpoolTable
  }
})
export default class SpoolSelectionDialog extends Mixins(StateMixin, BrowserMixin) {
  search = ''
  selectedSpoolId: number | null = null

  cameraScanSource: null | string = null

  hasDeviceCamera = false

  async mounted () {
    this.hasDeviceCamera = await QrScanner.hasCamera()
  }

  @Watch('open')
  onOpen () {
    if (this.open) {
      if (this.spoolSelectionOnly) {
        this.selectedSpoolId = this.$typedState.spoolman.dialog.selectedSpoolId ?? null
      } else if (this.targetMacro) {
        const macro = this.$typedGetters['macros/getMacroByName'](this.targetMacro)

        this.selectedSpoolId = typeof macro?.variables?.spool_id === 'number'
          ? macro.variables.spool_id
          : null
      } else {
        this.selectedSpoolId = this.$typedState.spoolman.activeSpool
      }

      if (this.currentFileName && this.currentFile == null) {
        SocketActions.serverFilesMetadata(this.currentFileName)
      }

      if (this.hasDeviceCamera && this.preferDeviceCamera) {
        this.$nextTick(() => (this.cameraScanSource = 'device'))
      } else {
        const autoOpenCameraId = this.autoOpenQRDetectionCamera
        if (autoOpenCameraId && this.$typedGetters['webcams/getWebcamById'](autoOpenCameraId)) {
          this.$nextTick(() => (this.cameraScanSource = autoOpenCameraId))
        }
      }
    }
  }

  get open (): boolean {
    return this.$typedState.spoolman.dialog.show
  }

  set open (val: boolean) {
    this.$typedCommit('spoolman/setDialogState', {
      ...this.$typedState.spoolman.dialog,
      show: val
    })
  }

  get filename (): string | undefined {
    const filename: string | undefined = this.$typedState.spoolman.dialog.filename

    if (filename && filename.startsWith('/')) {
      return filename.slice(1)
    }

    return filename
  }

  get currentFileName (): string {
    return this.filename || this.$typedState.printer.printer.print_stats?.filename || ''
  }

  get currentFile (): AppFileWithMeta | undefined {
    const { filename, rootPath } = getFilePaths(this.currentFileName, 'gcodes')

    return this.$typedGetters['files/getFile'](rootPath, filename)
  }

  get spoolSelectionOnly (): boolean {
    return this.$typedState.spoolman.dialog.spoolSelectionOnly ?? false
  }

  get targetMacro (): string | undefined {
    return this.$typedState.spoolman.dialog.targetMacro
  }

  get enabledWebcams (): Moonraker.Webcam.Entry[] {
    return this.$typedGetters['webcams/getEnabledWebcams']
  }

  get availableCameras (): Pick<Moonraker.Webcam.Entry, 'uid' | 'name'>[] {
    const cameras: Pick<Moonraker.Webcam.Entry, 'uid' | 'name'>[] = this.enabledWebcams
      .filter(camera => camera.service !== 'iframe')

    if (this.hasDeviceCamera) {
      // always show device camera first
      cameras.unshift({
        name: this.$t('app.spoolman.label.device_camera').toString(),
        uid: 'device'
      })
    }

    return cameras
  }

  handleQRCodeDetected (id: number) {
    this.cameraScanSource = null
    this.selectedSpoolId = id
    // clear any active filter so the scanned spool is guaranteed to be visible
    this.search = ''

    if (this.autoSelectSpoolOnMatch) {
      this.handleSelectSpool()
    }
  }

  async handleSelectSpool () {
    if (this.spoolSelectionOnly) {
      // save selection for parent dialog
      this.$typedCommit('spoolman/setDialogState', {
        show: false,
        selectedSpoolId: this.selectedSpoolId ?? undefined
      })
      return
    }

    if (!this.selectedSpoolId) {
      // no spool selected

      const confirmation = await this.$confirm(
        this.$tc('app.spoolman.msg.no_spool'),
        { title: this.$tc('app.general.label.confirm'), color: 'card-heading', icon: '$warning' }
      )

      if (!confirmation) {
        return
      }
    }

    if (this.targetMacro) {
      // no need to run sanity checks or start a print when we target a macro, so we return early

      // set spool_id via SET_GCODE_VARIABLE
      const commands = [
        `SET_GCODE_VARIABLE MACRO=${this.targetMacro} VARIABLE=spool_id VALUE=${this.selectedSpoolId ?? 'None'}`
      ]

      const printerConfig: Klipper.ConfigState = this.$typedGetters['printer/getPrinterConfig']
      const supportsSaveVariables = printerConfig.save_variables
      if (supportsSaveVariables) {
        // persist selected spool across restarts
        commands.push(`SAVE_VARIABLE VARIABLE=${this.targetMacro.toLowerCase()}__spool_id VALUE=${this.selectedSpoolId ?? 'None'}`)
      }

      this.sendGcode(commands.join('\n'))

      const macro = this.$typedGetters['macros/getMacroByName'](this.targetMacro)
      if (macro?.variables?.active) {
        // selected tool is active, update active spool
        await SocketActions.serverSpoolmanPostSpoolId(this.selectedSpoolId ?? undefined)
      }

      this.open = false
      return
    }

    const spool: Spool | undefined = this.selectedSpoolId != null
      ? this.$typedGetters['spoolman/getSpoolById'](this.selectedSpoolId)
      : undefined
    if (spool && this.currentFileName && (this.warnOnFilamentTypeMismatch || this.warnOnNotEnoughFilament)) {
      // trigger sanity checks when we have an active file
      // (current print or new print) and sanity checks are enabled.

      if (this.currentFile && (this.filename || !['complete', 'cancelled'].includes(this.printerState))) {
        // if we're tracking a file and starting a new print or the current one hasn't ended yet

        if (this.warnOnFilamentTypeMismatch) {
          const fileMaterials = this.currentFile.filament_type?.map(x => x.toLowerCase())
          const spoolMaterial = spool.filament.material?.toLowerCase()

          if (spoolMaterial && fileMaterials && !fileMaterials.includes(spoolMaterial)) {
            // filament materials don't match

            const confirmation = await this.$confirm(
              this.$tc('app.spoolman.msg.mismatched_filament'),
              { title: this.$tc('app.general.label.confirm'), color: 'card-heading', icon: '$warning' }
            )

            if (!confirmation) {
              return
            }
          }
        }

        let requiredLength = this.currentFile?.filament_total
        if (requiredLength && ['printing', 'paused'].includes(this.printerState)) {
          // if we're currently running a print job, subtract the already printed amount from the required length
          requiredLength -= this.$typedState.printer.printer.print_stats?.filament_used ?? 0
          requiredLength = Math.max(requiredLength, 0)
        }

        if (!requiredLength) {
          // missing file metadata

          const confirmation = await this.$confirm(
            this.$tc('app.spoolman.msg.no_required_length'),
            { title: this.$tc('app.general.label.confirm'), color: 'card-heading', icon: '$warning' }
          )

          if (!confirmation) {
            return
          }
        } else if (this.warnOnNotEnoughFilament) {
          if (spool.remaining_length != null && requiredLength >= spool.remaining_length) {
            // not enough filament

            const confirmation = await this.$confirm(
              this.$tc('app.spoolman.msg.no_filament'),
              { title: this.$tc('app.general.label.confirm'), color: 'card-heading', icon: '$warning' }
            )

            if (!confirmation) {
              return
            }
          }
        }
      }
    }

    await SocketActions.serverSpoolmanPostSpoolId(this.selectedSpoolId ?? undefined)

    if (this.filename) {
      await SocketActions.printerPrintStart(this.filename)

      if (this.$route.name !== 'home') {
        this.$router.push({ name: 'home' })
      }
    }

    this.open = false
  }

  get spoolmanURL (): string | undefined {
    return this.$typedGetters['spoolman/getSpoolmanUrl']
  }

  get preferDeviceCamera () {
    return this.$typedState.config.uiSettings.spoolman.preferDeviceCamera
  }

  get autoOpenQRDetectionCamera (): string | null {
    return this.$typedState.config.uiSettings.spoolman.autoOpenQRDetectionCamera
  }

  get autoSelectSpoolOnMatch (): boolean {
    return this.$typedState.config.uiSettings.spoolman.autoSelectSpoolOnMatch
  }

  get warnOnNotEnoughFilament (): boolean {
    return this.$typedState.config.uiSettings.spoolman.warnOnNotEnoughFilament
  }

  get warnOnFilamentTypeMismatch (): boolean {
    return this.$typedState.config.uiSettings.spoolman.warnOnFilamentTypeMismatch
  }
}
</script>
