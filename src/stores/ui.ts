import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Prompt } from '@/engine/alerts'
import { lockReason } from '@/engine/phase'
import type { UpgradeTarget } from '@/engine/types'
import { useGameStore } from './game'

export type InventKind = 'resource' | 'strategy' | 'unit' | 'mind' | 'upgrade' | 'create' | 'sourcing' | 'storage' | 'cover'

/** Which proposal dialog is open, and anything to pre-fill from where it was opened. */
export interface InventRequest {
  kind: InventKind
  unitId?: string
  outputId?: string
  /** Storage: the resource to store more of. */
  resourceId?: string
  /** Upgrades: what to improve. */
  target?: UpgradeTarget
  /** A preset to fill the form from, by name. */
  preset?: string
  /** Resources: a name and description to start from. */
  name?: string
  description?: string
  /** The dialog to reopen once this one's proposal is accepted. */
  then?: InventRequest
  /** Units: the plan's first unit, which is free. */
  first?: boolean
}

/** The views in the middle of the bench. */
export type Tab = 'board' | 'research' | 'manual' | 'log'

/** A datasheet: everything about one thing, on paper, in the drawer. */
export type SheetRef =
  | { kind: 'resource' | 'unit' | 'mind' | 'strategy' | 'research'; id: string }
  | { kind: 'trait' | 'rtrait' | 'ctrait'; id: string }
  | { kind: 'jev' }

const sameSheet = (a: SheetRef, b: SheetRef) => a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '')

export const useUiStore = defineStore('ui', () => {
  /** The title screen shows on every load, until the player starts or continues. */
  const screen = ref<'title' | 'game'>('title')
  const invent = ref<InventRequest | null>(null)
  const notice = ref<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const tab = ref<Tab>('board')
  /** A unit chip to scroll to and flash. */
  const focus = ref<string | null>(null)
  /** Open datasheets, the top one last. */
  const sheets = ref<SheetRef[]>([])
  /** The board's zoom. */
  const zoom = ref(1)
  /** The net under the pointer on the board: a resource, unit or strategy id, to light up. */
  const hover = ref<string | null>(null)

  const log = (event: string, data: Record<string, unknown>) => useGameStore().logTo('ui', event, data)

  function leaveTitle(how: 'start' | 'continue' | 'new') {
    screen.value = 'game'
    log('title_closed', { how })
  }

  function openInvent(request: InventRequest) {
    notice.value = null
    invent.value = request
  }

  function closeInvent() {
    invent.value = null
  }

  /** Opens a datasheet. From inside another sheet it stacks (with a way back); otherwise it replaces them. */
  function openSheet(sheet: SheetRef, stack = false) {
    const top = sheets.value[sheets.value.length - 1]
    if (top && sameSheet(top, sheet)) return
    sheets.value = stack ? [...sheets.value, sheet] : [sheet]
    log('sheet', { ...sheet, depth: sheets.value.length })
  }

  function backSheet() {
    sheets.value = sheets.value.slice(0, -1)
  }

  function closeSheets() {
    if (sheets.value.length) log('sheet', { kind: null })
    sheets.value = []
  }

  function setZoom(z: number) {
    zoom.value = Math.min(1.25, Math.max(0.6, Math.round(z * 20) / 20))
  }

  function show(unitId: string) {
    tab.value = 'board'
    focus.value = unitId
  }

  /** Opens the dialog for the plan's free first unit. */
  function openFirstUnit() {
    const first = useGameStore().state.phase.firstUnit
    if (first) openInvent({ kind: 'unit', first: true, name: first.name, description: first.description })
  }

  /** Follows an alert's prompt into the right proposal. */
  function follow(prompt: Prompt) {
    switch (prompt.kind) {
      case 'make-resource': {
        // Before industry, the only way to make something is Procurement.
        const state = useGameStore().state
        return openInvent(
          lockReason(state, 'strategy')
            ? { kind: 'create', outputId: prompt.resourceId }
            : { kind: 'strategy', outputId: prompt.resourceId }
        )
      }
      case 'upgrade':
        return openInvent({ kind: 'upgrade', target: { kind: 'unit', id: prompt.unitId } })
      case 'upgrade-mind':
        return openInvent({ kind: 'upgrade', target: { kind: 'mind', id: prompt.mindId } })
      case 'first-unit':
        return openFirstUnit()
      case 'design-mind':
        return openInvent({ kind: 'mind' })
      case 'create':
        return openInvent({ kind: 'create' })
      case 'source':
        return openInvent({ kind: 'sourcing', unitId: prompt.unitId })
      case 'storage':
        return openInvent({ kind: 'storage', resourceId: prompt.resourceId })
      case 'research':
        tab.value = 'research'
        return
      case 'assign':
        return show(prompt.unitId)
    }
  }

  return {
    screen,
    leaveTitle,
    invent,
    notice,
    tab,
    focus,
    sheets,
    zoom,
    hover,
    openInvent,
    closeInvent,
    openSheet,
    backSheet,
    closeSheets,
    setZoom,
    show,
    follow,
    openFirstUnit
  }
})
