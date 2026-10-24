<template>
  <article ref="card" class="card" :class="{ focus: ui.focus === unit.id }">
    <header class="head">
      <span class="icon">{{ unit.icon }}</span>
      <div class="title">
        <div class="name">
          <strong>{{ unit.name }}</strong>
          <span class="chip tier" :title="`One is worth: ${unitValueText(unit.value)}`">{{ tierLabel(unit.tier) }}</span>
          <TraitChips :traits="unit.traits" :unit="unit" />
        </div>
        <div class="muted small desc">{{ unit.description }}</div>
      </div>
      <div class="count num" title="Owned, of how many your sourcing allows">
        {{ fmtCount(unit.count) }}<span class="muted small"> / {{ fmtCount(cap) }}</span>
        <div v-if="pending" class="small muted">+{{ fmtCount(pending) }} on the way</div>
      </div>
    </header>

    <div class="facts small muted">
      <span>{{ unit.upkeep.length ? `Runs on ${describeFlows(game.state, unit.upkeep)} a week` : 'No upkeep' }}</span>
      <span>· Jev: {{ Math.round(unit.plausibility * 100) }}% plausible</span>
      <span v-if="unit.crew">· Each needs {{ unit.crew.per }} {{ unitName(unit.crew.unitId) }}</span>
      <label v-if="has(unit, 'overclockable')" class="oc">
        <input type="checkbox" :checked="unit.overclocked" @change="game.setOverclock(unit.id, !unit.overclocked)" />
        Overclock (×2 output, ×3 upkeep)
      </label>
    </div>

    <div class="sourcing small">
      <div class="bar" :title="`${fmtCount(owned(unit))} of ${fmtCount(cap)} owned`">
        <div class="fill" :style="{ width: `${cap ? Math.min(100, (100 * owned(unit)) / cap) : 0}%` }" />
      </div>
      <p v-if="!contracts.length" class="warn">No sourcing yet: you can’t own any until you find a way to get them.</p>
      <div v-for="c in contracts" :key="c.id" class="contract row">
        <span class="cname">
          📦 <strong>{{ c.name }}</strong>&nbsp;<span class="muted num">{{ fmtCount(c.used) }}/{{ fmtCount(c.total) }}</span>
          <span v-if="c.risky" class="chip bad">risky</span>
        </span>
        <template v-if="c.parts.length && openSlots(c) > 0">
          <span class="muted">each takes {{ describeFlows(game.state, partsFor(unit, c)) }}</span>
          <input
            :value="n(c)"
            class="n"
            type="number"
            min="1"
            :aria-label="`How many to create from ${c.name}`"
            @input="createN[c.id] = Number(($event.target as HTMLInputElement).value)"
          />
          <button class="small" :disabled="!canCreate(c)" @click="game.createUnits(c.id, n(c))">
            Create {{ fmtCount(n(c)) }}
          </button>
          <button class="link" :disabled="!affordable(game.state, c)" title="The most you can pay the parts for right now" @click="createN[c.id] = affordable(game.state, c)">
            max {{ fmtCount(affordable(game.state, c)) }}
          </button>
          <button
            class="link"
            :disabled="!creatable(game.state, c, use)"
            title="The most you can make while still paying next week's upkeep and every other drain, plus a week of upkeep for the new ones"
            @click="createN[c.id] = creatable(game.state, c, use)"
          >
            affordable {{ fmtCount(creatable(game.state, c, use)) }}
          </button>
          <span v-if="shortFor(c)" class="warn">You need {{ shortFor(c) }}.</span>
        </template>
        <span v-else class="muted">{{ c.parts.length ? 'full' : 'made by Create' }}</span>
      </div>
    </div>

    <ul v-if="warnings.length" class="plain-list warnings small">
      <li v-for="w in warnings" :key="w" class="warn">{{ w }}</li>
    </ul>

    <TaskList :unit="unit" />

    <footer class="row foot">
      <button class="link" @click="ui.openInvent({ kind: 'sourcing', unitId: unit.id })">Find sourcing</button>
      <button class="link" @click="ui.openInvent({ kind: 'strategy', unitId: unit.id })">+ strategy</button>
      <button
        class="link"
        :disabled="!!upgradeLock"
        :title="upgradeLock ?? ''"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'unit', id: unit.id } })"
      >
        Upgrade
      </button>
      <span v-if="upgradeLock" class="muted small">{{ upgradeLock }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { createCost } from '@/engine/actions'
import { lockReason } from '@/engine/phase'
import {
  affordable,
  contractsFor,
  costShortfall,
  creatable,
  describeFlows,
  findResource,
  findUnit,
  fmtCount,
  openSlots,
  owned,
  partsFor,
  tierLabel,
  unitCap,
  unitValueText,
  weeklyUse
} from '@/engine/model'
import { has } from '@/engine/traits'
import type { Sourcing, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import TaskList from './TaskList.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ unit: UnitType }>()
const game = useGameStore()
const ui = useUiStore()
const card = ref<HTMLElement>()

const pending = computed(() => props.unit.pending.reduce((n, p) => n + p.count, 0))
const contracts = computed(() => contractsFor(game.state, props.unit.id))
const cap = computed(() => unitCap(game.state, props.unit.id))
const use = computed(() => weeklyUse(game.preview))
/** How many to create, per contract. */
const createN = reactive<Record<string, number>>({})
const n = (c: Sourcing) => Math.max(0, Math.floor(createN[c.id] ?? 1))
const shortFor = (c: Sourcing) => (n(c) ? costShortfall(game.state, createCost(partsFor(props.unit, c), n(c))) : null)
const canCreate = (c: Sourcing) => n(c) >= 1 && n(c) <= openSlots(c) && !shortFor(c)
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'
const upgradeLock = computed(() => lockReason(game.state, 'unit-upgrade'))

const warnings = computed(() => {
  const w = game.preview.units[props.unit.id]
  if (!w) return []
  const out: string[] = []
  if (w.resting) out.push('Resting this week (Intermittent).')
  if (w.unpaid > 0.5 && w.unpaidFor) {
    out.push(`${fmtCount(w.unpaid)} can’t pay their ${findResource(game.state, w.unpaidFor)?.name ?? ''} upkeep.`)
  }
  if (w.unassigned > 0) out.push(`${fmtCount(w.unassigned)} have nothing to do.`)
  return out
})

watch(
  () => ui.focus,
  async (id) => {
    if (id !== props.unit.id) return
    await nextTick()
    card.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      if (ui.focus === props.unit.id) ui.focus = null
    }, 1600)
  },
  { immediate: true }
)
</script>

<style scoped>
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--panel-raised);
  transition: border-color 0.3s;
}

.card.focus {
  border-color: var(--accent);
}

.head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.icon {
  font-size: 24px;
  width: 30px;
  text-align: center;
}

.title {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.desc {
  margin-top: 2px;
}

.count {
  font-size: 18px;
  text-align: right;
  white-space: nowrap;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
}

.oc {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  margin-left: 6px;
  color: var(--text);
}

.oc input {
  width: auto;
}

.sourcing {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sourcing p {
  margin: 0;
}

.contract {
  gap: 6px;
  flex-wrap: wrap;
}

.bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--accent);
}

.warnings {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.foot {
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
</style>
