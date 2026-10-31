<template>
  <article
    ref="el"
    class="pkg unit"
    :class="{ focus: flashing }"
    :style="{ width: `${width}px` }"
    :data-chip="unit.id"
    @mouseenter="ui.hover = unit.id"
    @mouseleave="ui.hover = null"
  >
    <header class="head">
      <span class="part">{{ tierLabel(unit.tier) }}</span>
      <Led :tone="status.tone" :blink="status.blink" :title="status.title" />
    </header>
    <div class="titlerow">
      <button type="button" class="title" @click="ui.openSheet({ kind: 'unit', id: unit.id })">
        <span class="icon">{{ unit.icon }}</span>
        <span class="pkg-name">{{ unit.name }}</span>
      </button>
      <span class="count num" title="Owned, of how many your sourcing allows">
        ×{{ fmtCount(unit.count) }}<span class="cap"> / {{ fmtCount(cap) }}</span>
      </span>
    </div>
    <Gauge :value="owned(unit)" :max="Math.max(1, cap)" :segments="20" tone="copper" :title="`${fmtCount(owned(unit))} of ${fmtCount(cap)} owned`" />

    <div class="tags">
      <span v-if="pending" class="tag">+{{ fmtCount(pending) }} on the way</span>
      <span v-if="incoming" class="tag good">+{{ fmt(incoming) }} from Procurement</span>
      <span v-for="w in warnings" :key="w.text" class="tag" :class="w.tone" :title="w.title">{{ w.text }}</span>
      <button
        v-for="t in unit.traits"
        :key="t"
        type="button"
        class="tag trait"
        :class="TRAITS[t].kind"
        :title="`${TRAITS[t].name} (${TRAITS[t].kind}): ${TRAITS[t].rule}`"
        @click="ui.openSheet({ kind: 'trait', id: t })"
      >
        {{ TRAITS[t].icon }} {{ TRAITS[t].name }}
      </button>
      <label v-if="has(unit, 'overclockable')" class="oc" title="×2 output, ×3 upkeep">
        <input type="checkbox" :checked="unit.overclocked" @change="game.setOverclock(unit.id, !unit.overclocked)" />
        <span>OC</span>
      </label>
    </div>

    <div v-if="strategies.length" class="pins">
      <PinRow v-for="s in strategies" :key="s.id" :strategy="s" :unit="unit" :count="alloc.byTask[s.id] ?? 0" :pin="pinOf(s.id)" />
    </div>
    <p v-else class="lock">No strategies yet.</p>

    <div class="feeders">
      <p v-if="!contracts.length" class="nosrc"><Led tone="warn" /> None yet: you can’t own any until you Procure some.</p>
      <FeederRow v-for="c in contracts" :key="c.id" :contract="c" :unit="unit" />
    </div>

    <footer class="pkg-foot">
      <button class="link" @click="ui.openInvent({ kind: 'strategy', unitId: unit.id })">+ strategy</button>
      <button class="link" @click="ui.openInvent({ kind: 'create', unitId: unit.id })">Procure</button>
      <button
        class="link"
        :disabled="!!upgradeLock"
        :title="upgradeLock ?? ''"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'unit', id: unit.id } })"
      >
        Upgrade
      </button>
    </footer>
    <p v-if="upgradeLock" class="lock">{{ upgradeLock }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { allocation, contractsFor, findResource, fmt, fmtCount, owned, tierLabel, unitCap } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { has, TRAITS } from '@/engine/traits'
import type { UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Gauge from '../kit/SegGauge.vue'
import Led, { type LedTone } from '../kit/StatusLed.vue'
import FeederRow from './FeederRow.vue'
import type { Column } from './layout'
import PinRow from './PinRow.vue'

const props = defineProps<{ unit: UnitType; width: number; column?: Column }>()
const game = useGameStore()
const ui = useUiStore()
const el = ref<HTMLElement>()
const flashing = ref(false)

const strategies = computed(() => game.state.strategies.filter((s) => s.unitId === props.unit.id))
const alloc = computed(() => allocation(game.state, props.unit))
const contracts = computed(() => contractsFor(game.state, props.unit.id))
const cap = computed(() => unitCap(game.state, props.unit.id))
const pending = computed(() => props.unit.pending.reduce((n, p) => n + p.count, 0))
/** Units a Procurement still owes this type. */
const incoming = computed(() =>
  game.state.deliveries.filter((d) => d.target.kind === 'unit' && d.target.id === props.unit.id).reduce((n, d) => n + d.amount, 0)
)
const upgradeLock = computed(() => lockReason(game.state, 'unit-upgrade'))
const pinOf = (strategyId: string) => props.column?.lanes.find((l) => l.id === strategyId)?.pin ?? null

const week = computed(() => game.preview.units[props.unit.id])
const warnings = computed(() => {
  const w = week.value
  const out: { text: string; tone: string; title: string }[] = []
  if (!w) return out
  if (w.resting) out.push({ text: 'Resting', tone: 'warn', title: 'Resting this week (Intermittent).' })
  if (w.unpaid > 0.5 && w.unpaidFor) {
    const r = findResource(game.state, w.unpaidFor)?.name ?? ''
    out.push({ text: `Unpaid ${fmtCount(w.unpaid)}`, tone: 'bad', title: `${fmtCount(w.unpaid)} can’t pay their ${r} upkeep.` })
  }
  if (w.unassigned > 0) out.push({ text: `Idle ${fmtCount(w.unassigned)}`, tone: 'warn', title: `${fmtCount(w.unassigned)} have nothing to do.` })
  return out
})
const status = computed<{ tone: LedTone; blink: boolean; title: string }>(() => {
  const w = week.value
  if (!props.unit.count) return { tone: 'off', blink: false, title: 'None owned' }
  if (w?.unpaid && w.unpaid > 0.5) return { tone: 'bad', blink: true, title: 'Some can’t pay their upkeep' }
  if (w?.resting) return { tone: 'off', blink: true, title: 'Resting this week' }
  if (w?.unassigned) return { tone: 'warn', blink: false, title: 'Some have nothing to do' }
  return { tone: 'good', blink: false, title: 'All working' }
})

watch(
  () => ui.focus,
  async (id) => {
    if (id !== props.unit.id) return
    await nextTick()
    el.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' })
    flashing.value = true
    setTimeout(() => {
      flashing.value = false
      if (ui.focus === props.unit.id) ui.focus = null
    }, 1600)
  },
  { immediate: true }
)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 16px;
}

.titlerow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  text-align: left;
}

.title:hover:not(:disabled) {
  background: none;
}

.title:hover .pkg-name {
  color: var(--copper-hi);
}

.icon {
  font-size: 18px;
}

.count {
  font-size: 15px;
  color: var(--lcd-fg);
  white-space: nowrap;
}

.cap {
  font-size: 11px;
  color: var(--silk-dim);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag {
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 5px;
  border: 1px solid currentColor;
  color: var(--silk-dim);
  background: rgb(0 0 0 / 0.3);
  box-shadow: none;
}

.tag.good,
.tag.perk {
  color: var(--led-g);
}

.tag.warn,
.tag.drawback {
  color: var(--led-a);
}

.tag.bad {
  color: var(--led-r);
}

.tag.mixed {
  color: var(--led-b);
}

.oc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-label);
  font-size: 11px;
  color: var(--led-a);
}

.pins,
.feeders {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nosrc {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 0;
  font-size: 11.5px;
  color: var(--led-a);
}

.lock {
  margin: 0;
}
</style>
