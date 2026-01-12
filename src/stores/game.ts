import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface Intelligence {
  imagination: number
  analytics: number
  persuasiveness: number
  abstraction: number
  recall: number
  hallucinations: number
}

export interface Costs {
  buildCost: number
  wattage: number
  rackSpace: number
}

export interface CustomUnit {
  id: string
  name: string
  normalizedName: string
  icon: string
  displayFormat: 'plain' | 'xp' | 'percentage'
  hidden: boolean
  kind: 'builtin' | 'custom'
  amountKey?: 'money' | 'watts' | 'rackSpace'
}

export const useGameStore = defineStore('game', () => {
  // Resources
  const money = ref(1000)
  const watts = ref(100)
  const rackSpace = ref(10)

  // Stats
  const unitCount = ref(5)
  const costs = ref<Costs>({
    buildCost: 50,
    wattage: 10,
    rackSpace: 2
  })
  const intelligence = ref<Intelligence>({
    imagination: 5,
    analytics: 5,
    persuasiveness: 5,
    abstraction: 5,
    recall: 5,
    hallucinations: 0
  })

  // All resources, including built-ins and player-created custom resources.
  // Built-ins are seeded here so they share the same shape/logic.
  const customUnits = ref<CustomUnit[]>([
    {
      id: 'builtin-money',
      name: 'Money',
      normalizedName: 'money',
      icon: '💰',
      displayFormat: 'plain',
      hidden: false,
      kind: 'builtin',
      amountKey: 'money'
    },
    {
      id: 'builtin-watts',
      name: 'Watts',
      normalizedName: 'watts',
      icon: '⚡',
      displayFormat: 'plain',
      hidden: false,
      kind: 'builtin',
      amountKey: 'watts'
    },
    {
      id: 'builtin-rackspace',
      name: 'Rack Space',
      normalizedName: 'rack space',
      icon: '🗄️',
      displayFormat: 'plain',
      hidden: false,
      kind: 'builtin',
      amountKey: 'rackSpace'
    },
    // Example hidden resources that exist from the start but are not shown
    // until the player interacts with them via the custom resource UI.
    {
      id: 'hidden-compute-tokens',
      name: 'Compute Tokens',
      normalizedName: 'compute tokens',
      icon: '⚙️',
      displayFormat: 'plain',
      hidden: true,
      kind: 'builtin'
    },
    {
      id: 'hidden-training-epochs',
      name: 'Training Epochs',
      normalizedName: 'training epochs',
      icon: '📈',
      displayFormat: 'xp',
      hidden: true,
      kind: 'builtin'
    }
  ])

  // Game state
  const currentDay = ref(1)

  // Actions
  function nextDay() {
    // Future per-day logic will go here
    currentDay.value++
  }

  function addUnit() {
    if (money.value >= costs.value.buildCost && 
        watts.value >= costs.value.wattage && 
        rackSpace.value >= costs.value.rackSpace) {
      money.value -= costs.value.buildCost
      watts.value -= costs.value.wattage
      rackSpace.value -= costs.value.rackSpace
      unitCount.value++
    }
  }

  function addCustomUnit(
    unit: Omit<
      CustomUnit,
      'id' | 'normalizedName' | 'hidden' | 'kind' | 'amountKey'
    >
  ) {
    const normalizedName = unit.name.trim().toLowerCase()
    const existing = customUnits.value.find(
      u => u.normalizedName === normalizedName
    )

    // If a matching resource exists but is hidden, reveal and update it
    if (existing) {
      if (existing.hidden) {
        existing.hidden = false
        existing.icon = unit.icon
        existing.displayFormat = unit.displayFormat
      }
      return
    }

    customUnits.value.push({
      ...unit,
      id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      normalizedName,
      hidden: false,
      kind: 'custom'
    })
  }

  const hasOverlappingUnit = (proposedName: string) => {
    const normalized = proposedName.trim().toLowerCase()
    if (!normalized) return false

    return customUnits.value.some(
      u =>
        !u.hidden &&
        (u.normalizedName === normalized ||
          u.normalizedName.includes(normalized) ||
          normalized.includes(u.normalizedName))
    )
  }

  function revealResource(
    id: string,
    overrides?: Partial<Pick<CustomUnit, 'icon' | 'displayFormat'>>
  ) {
    const res = customUnits.value.find((r) => r.id === id)
    if (!res) return
    res.hidden = false
    if (overrides?.icon) res.icon = overrides.icon
    if (overrides?.displayFormat) res.displayFormat = overrides.displayFormat
  }

  return {
    // State
    money,
    watts,
    rackSpace,
    unitCount,
    costs,
    intelligence,
    customUnits,
    currentDay,
    
    // Actions
    nextDay,
    addUnit,
    addCustomUnit,
    hasOverlappingUnit,
    revealResource
  }
})
