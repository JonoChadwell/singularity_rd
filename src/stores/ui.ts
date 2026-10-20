import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Prompt } from '@/engine/alerts'
import type { Change } from '@/engine/types'

export type InventKind = 'resource' | 'strategy' | 'unit' | 'breakthrough'

/** Which proposal dialog is open, and anything to pre-fill from where it was opened. */
export interface InventRequest {
  kind: InventKind
  unitId?: string
  outputId?: string
  mind?: boolean
  targetIQ?: number
  /** Breakthroughs: what to change, and a change to start from. */
  target?: { kind: 'unit' | 'strategy'; id: string }
  change?: Change['kind']
  /** A preset to fill the form from, by name. */
  preset?: string
  /** Resources: a name and description to start from. */
  name?: string
  description?: string
  /** The dialog to reopen once this one's proposal is accepted. */
  then?: InventRequest
}

export type Tab = 'minds' | 'industry' | 'projects' | 'market'

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

  function show(unitId: string, mind: boolean) {
    tab.value = mind ? 'minds' : 'industry'
    focus.value = unitId
  }

  /** Follows a wall's prompt into the right proposal. */
  function follow(prompt: Prompt, mind: (unitId: string) => boolean) {
    switch (prompt.kind) {
      case 'make-resource':
        return openInvent({ kind: 'strategy', outputId: prompt.resourceId })
      case 'own-layer':
        return openInvent({ kind: 'breakthrough', target: { kind: 'unit', id: prompt.unitId }, change: 'layer' })
      case 'design-mind':
        return openInvent({ kind: 'unit', mind: true, targetIQ: prompt.iq })
      case 'assign':
        return show(prompt.unitId, mind(prompt.unitId))
    }
  }

  return { invent, notice, tab, focus, openInvent, closeInvent, show, follow }
})
