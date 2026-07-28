import type { ActionTree } from 'vuex'
import type {
  SpoolmanState,
  WebsocketBasePayload,
  WebsocketFilamentPayload,
  WebsocketSpoolPayload,
  WebsocketVendorPayload
} from './types'
import type { RootState } from '../types'
import { SocketActions } from '@/api/socketActions'
import { consola } from 'consola'
import { EventBus } from '@/eventBus'
import { gte, valid } from 'semver'

const logPrefix = '[SPOOLMAN]'

// Retry the initial fetch when Spoolman is unreachable at connect time, since
// Moonraker only notifies us on a status transition.
const AVAILABLE_SPOOLS_RETRY_DELAY = 5000
const AVAILABLE_SPOOLS_MAX_RETRIES = 12
let availableSpoolsRetryTimer: ReturnType<typeof setTimeout> | null = null
let availableSpoolsRetryCount = 0

const clearAvailableSpoolsRetry = () => {
  if (availableSpoolsRetryTimer != null) {
    clearTimeout(availableSpoolsRetryTimer)
    availableSpoolsRetryTimer = null
  }
  availableSpoolsRetryCount = 0
}

const scheduleAvailableSpoolsRetry = () => {
  if (availableSpoolsRetryCount >= AVAILABLE_SPOOLS_MAX_RETRIES) return
  availableSpoolsRetryCount++
  availableSpoolsRetryTimer = setTimeout(fetchAvailableSpools, AVAILABLE_SPOOLS_RETRY_DELAY)
}

const fetchAvailableSpools = () => {
  // Moonraker rejects the proxy request outright (JSON-RPC error) when its
  // spoolman component isn't ready yet — that path never dispatches
  // onAvailableSpools, so the retry has to hang off the rejection as well.
  SocketActions.serverSpoolmanProxyGetAvailableSpools()
    .catch(() => scheduleAvailableSpoolsRetry())
}

const payloadAsSpoolmanProxyResponseV2 = <T>(payload: Moonraker.Spoolman.ProxyResponse<T>, emitError = true): Moonraker.Spoolman.ProxyResponseV2<T> => {
  if (
    payload != null &&
    typeof payload === 'object' &&
    'error' in payload &&
    'response' in payload
  ) {
    if (payload.error != null && emitError) {
      EventBus.$emit(typeof payload.error === 'string' ? payload.error : payload.error.message, { type: 'error' })
    }

    return payload
  }

  return {
    error: null,
    response: payload
  }
}

const createSpoolmanSocket = (spoolmanUrl: string): WebSocket | undefined => {
  try {
    const socketUrl = new URL(spoolmanUrl)

    socketUrl.pathname += `${socketUrl.pathname.endsWith('/') ? '' : '/'}api/v1/`
    socketUrl.protocol = socketUrl.protocol === 'https:'
      ? 'wss:'
      : 'ws:'

    return new WebSocket(socketUrl)
  } catch (err) {
    consola.error(`${logPrefix} failed to create websocket`, err)
  }
}

export const actions = {
  /**
   * Reset our store
   */
  async reset ({ commit }) {
    clearAvailableSpoolsRetry()
    commit('setReset')
  },

  /**
   * Make a socket request to init the spoolman component.
   */
  async init () {
    clearAvailableSpoolsRetry()
    SocketActions.serverSpoolmanGetSpoolId()
    fetchAvailableSpools()
    SocketActions.serverSpoolmanProxyGetInfo()
  },

  async onActiveSpool ({ commit }, payload: Moonraker.Spoolman.SpoolIdResponse) {
    commit('setActiveSpool', payload.spool_id)
  },

  async onSpoolChange ({ commit, state }, { type, payload }: WebsocketSpoolPayload) {
    const spools = [...state.spools]

    switch (type) {
      case 'added': {
        spools.push(payload)

        break
      }

      case 'updated': {
        const index = spools.findIndex(spool => spool.id === payload.id)

        if (index >= 0) {
          spools[index] = payload
        }

        break
      }

      case 'deleted': {
        const index = spools.findIndex(spool => spool.id === payload.id)

        if (index >= 0) {
          spools.splice(index, 1)
        }

        break
      }
    }

    commit('setSpools', spools)
  },

  async onFilamentChange ({ commit, state }, { type, payload }: WebsocketFilamentPayload) {
    if (type !== 'updated') {
      // we only care about updated filament types
      return
    }

    const spools = state.spools
      .map(spool => (
        spool.filament.id === payload.id
          ? {
              ...spool,
              filament: payload
            }
          : spool
      ))

    commit('setSpools', spools)
  },

  async onVendorChange ({ commit, state }, { type, payload }: WebsocketVendorPayload) {
    if (type !== 'updated') {
      // we only care about updated vendors
      return
    }

    const spools = state.spools
      .map(spool => (
        spool.filament.vendor?.id === payload.id
          ? {
              ...spool,
              filament: {
                ...spool.filament,
                vendor: payload
              }
            }
          : spool
      ))

    commit('setSpools', spools)
  },

  async onStatusChanged ({ commit, dispatch }, payload: boolean) {
    clearAvailableSpoolsRetry()

    if (payload) {
      // refresh data, connected state will be set on data retrieval
      dispatch('init')
    } else {
      commit('setConnected', payload)
    }
  },

  async onAvailableSpools ({ commit, dispatch }, payload: Moonraker.Spoolman.ProxyResponse<Moonraker.Spoolman.Spool[]>) {
    // Only toast the first failure; retries stay quiet.
    const isFirstAttempt = availableSpoolsRetryCount === 0
    payload = payloadAsSpoolmanProxyResponseV2(payload, isFirstAttempt)

    if (payload.error != null) {
      scheduleAvailableSpoolsRetry()
      return
    }

    clearAvailableSpoolsRetry()

    commit('setSpools', payload.response)

    commit('setConnected', true)

    dispatch('initializeWebsocketConnection')
  },

  async onInfo ({ state, commit }, payload: Moonraker.Spoolman.ProxyResponse<Moonraker.Spoolman.Info>) {
    payload = payloadAsSpoolmanProxyResponseV2(payload)

    if (payload.error != null) {
      return
    }

    commit('setInfo', payload.response)

    if (
      state.info &&
      valid(state.info.version) &&
      gte(state.info.version, '0.16.0')
    ) {
      SocketActions.serverSpoolmanProxyGetSettingCurrency()
    }
  },

  async onSettingCurrency ({ commit }, payload: Moonraker.Spoolman.ProxyResponse<Moonraker.Spoolman.Currency>) {
    payload = payloadAsSpoolmanProxyResponseV2(payload)

    if (payload.error != null) {
      return
    }

    commit('setCurrency', payload.response)
  },

  async initializeWebsocketConnection ({ state, getters, rootState, commit, dispatch }) {
    if (rootState.server.config.spoolman?.server) {
      if (state.socket?.readyState === WebSocket.OPEN) {
        // we already have a working WS conn
        return
      }

      // init websocket to listen for updates
      const spoolmanUrl: string = getters.getSpoolmanUrl
      const socket = createSpoolmanSocket(spoolmanUrl)

      if (socket == null) {
        commit('setSocket', null)
        return
      }

      socket.onerror = err => consola.warn(`${logPrefix} received websocket error`, err)
      socket.onmessage = event => {
        let data: WebsocketBasePayload

        try {
          data = JSON.parse(event.data) as WebsocketBasePayload
        } catch (err) {
          consola.error(`${logPrefix} failed to decode websocket message`, err, event.data)
          return
        }

        switch (data.resource) {
          case 'spool':
            dispatch('onSpoolChange', data)
            break

          case 'filament':
            dispatch('onFilamentChange', data)
            break

          case 'vendor':
            dispatch('onVendorChange', data)
            break

          default:
            consola.warn(`${logPrefix} ignoring websocket message with type ${data.resource}`)
        }
      }

      commit('setSocket', socket)
    } else {
      commit('setSocket', null)
    }
  }
} satisfies ActionTree<SpoolmanState, RootState>
