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
  /** Minds: an IQ to start from. */
  iq?: number
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

export type Tab = 'minds' | 'industry' | 'research'

export const useUiStore = defineStore('ui', () => {
  const invent = ref<InventRequest | null>(null)
  const notice = ref<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const tab = ref<Tab>('minds')
  /** A unit card to scroll to and highlight. */
  const focus = ref<string | null>(null)

  function openInvent(request: InventRequest) {
    notice.value = null
    invent.value = request
  }

  function closeInvent() {
    invent.value = null
  }

  function show(unitId: string) {
    tab.value = 'industry'
    focus.value = unitId
  }

  /** Opens the dialog for the plan's free first unit. */
  function openFirstUnit() {
    const first = useGameStore().state.phase.firstUnit
    if (first) openInvent({ kind: 'unit', first: true, name: first.name, description: first.description })
  }

  /** Follows a wall's prompt into the right proposal. */
  function follow(prompt: Prompt) {
    switch (prompt.kind) {
      case 'make-resource': {
        // Before industry, the only way to make something is Create.
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
        return openInvent({ kind: 'mind', iq: prompt.iq })
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

  return { invent, notice, tab, focus, openInvent, closeInvent, show, follow, openFirstUnit }
})
