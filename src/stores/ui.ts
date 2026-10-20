import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Prompt } from '@/engine/alerts'
import type { UpgradeTarget } from '@/engine/types'

export type InventKind = 'resource' | 'strategy' | 'unit' | 'mind' | 'upgrade' | 'income'

/** Which proposal dialog is open, and anything to pre-fill from where it was opened. */
export interface InventRequest {
  kind: InventKind
  unitId?: string
  outputId?: string
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

  /** Follows a wall's prompt into the right proposal. */
  function follow(prompt: Prompt) {
    switch (prompt.kind) {
      case 'make-resource':
        return openInvent({ kind: 'strategy', outputId: prompt.resourceId })
      case 'upgrade':
        return openInvent({ kind: 'upgrade', target: { kind: 'unit', id: prompt.unitId } })
      case 'design-mind':
        return openInvent({ kind: 'mind', iq: prompt.iq })
      case 'income':
        return openInvent({ kind: 'income' })
      case 'research':
        tab.value = 'research'
        return
      case 'assign':
        return show(prompt.unitId)
    }
  }

  return { invent, notice, tab, focus, openInvent, closeInvent, show, follow }
})
