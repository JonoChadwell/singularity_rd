<template>
  <DataSheet v-if="m" :part="partNo('CPU', m.id)" :title="m.name" :icon="m.icon" :subtitle="m.description">
    <section>
      <h4>Specifications</h4>
      <SpecTable :rows="specs" />
    </section>

    <section v-if="shifted.length">
      <h4>IQ counted per research</h4>
      <SpecTable :rows="shifted" />
    </section>

    <section v-if="m.traits.length">
      <h4>Compute traits</h4>
      <div v-for="t in m.traits" :key="t" class="trait">
        <button type="button" class="link" @click="ui.openSheet({ kind: 'ctrait', id: t }, true)">
          {{ computeTrait(t).icon }} {{ computeTrait(t).name }}
        </button>
        <span :class="computeTrait(t).kind === 'perk' ? 'good' : 'warn'"> {{ computeTrait(t).kind }}</span>
        <p>{{ computeTrait(t).rule }}</p>
      </div>
    </section>

    <section>
      <h4>Notes</h4>
      <p class="note">
        One machine at a time: a new platform replaces this one for good. It gets one software upgrade, which can be redone at full cost,
        replacing the last.
      </p>
    </section>

    <template #foot>
      <button
        class="small"
        :disabled="!!upgradeBlock"
        :title="upgradeBlock ?? ''"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: m.id } })"
      >
        Upgrade software
      </button>
      <button class="small" :disabled="!!mindLock" :title="mindLock ?? ''" @click="ui.openInvent({ kind: 'mind' })">+ New platform</button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { computeTrait, RESEARCH_TYPE_LABEL, RESEARCH_TYPES } from '@/engine/computeTraits'
import { currentIQ, findMind, iqFor, softwareLabel } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { mindUpgradeBlocker } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { partNo } from './text'

const props = defineProps<{ id: string }>()
const game = useGameStore()
const ui = useUiStore()
const m = computed(() => findMind(game.state, props.id))
const upgradeBlock = computed(() => (m.value ? mindUpgradeBlocker(game.state, m.value) : null))
const mindLock = computed(() => lockReason(game.state, 'mind'))

const specs = computed<SpecRow[]>(() => {
  const x = m.value
  if (!x) return []
  const rows: SpecRow[] = [
    { k: 'IQ', v: String(Math.round(currentIQ(x))), num: true },
    { k: 'Hardware', v: `${x.hardware.name} · IQ ${x.hardware.iq}` },
    { k: 'Software', v: `${softwareLabel(x)}${x.software.upgraded ? ` · +${x.software.iq} IQ` : ''}` },
    { k: 'Generation', v: String(x.tier), num: true }
  ]
  if (!x.starting) rows.push({ k: 'Jev', v: `${Math.round(x.plausibility * 100)}% plausible` })
  return rows
})

/** Research types its traits make it smarter or dumber for. */
const shifted = computed<SpecRow[]>(() => {
  const x = m.value
  if (!x) return []
  const base = Math.round(currentIQ(x))
  return RESEARCH_TYPES.map((t) => ({ t, iq: Math.round(iqFor(game.state, t)) }))
    .filter(({ iq }) => iq !== base)
    .map(({ t, iq }) => ({ k: RESEARCH_TYPE_LABEL[t], v: `IQ ${iq}`, num: true, tone: iq > base ? ('good' as const) : ('warn' as const) }))
})
</script>

<style scoped>
.trait + .trait {
  margin-top: 6px;
}

.trait p {
  font-size: 12px;
}
</style>
