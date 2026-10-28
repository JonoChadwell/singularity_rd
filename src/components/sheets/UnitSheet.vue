<template>
  <DataSheet v-if="u" :part="partNo('IC', u.id)" :title="u.name" :icon="u.icon" :subtitle="u.description">
    <section>
      <h4>Specifications</h4>
      <SpecTable :rows="specs" />
    </section>

    <section v-if="u.traits.length">
      <h4>Traits</h4>
      <div v-for="t in u.traits" :key="t" class="trait">
        <button type="button" class="link" @click="ui.openSheet({ kind: 'trait', id: t }, true)">{{ TRAITS[t].icon }} {{ TRAITS[t].name }}</button>
        <span class="note"> {{ TRAITS[t].kind }}</span>
        <p>{{ TRAITS[t].rule }}</p>
      </div>
    </section>

    <section>
      <h4>Pinout</h4>
      <table v-if="pins.length" class="pinout">
        <thead>
          <tr><th>Pin</th><th>Strategy</th><th class="num">On it</th><th>Each a week</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in pins" :key="p.s.id" :class="p.tone">
            <td class="num">{{ p.pin }}</td>
            <td>
              <button type="button" class="link" @click="ui.openSheet({ kind: 'strategy', id: p.s.id }, true)">{{ p.s.name }}</button>
            </td>
            <td class="num">{{ p.count }}{{ u.rest === p.s.id ? ' (rest)' : '' }}</td>
            <td class="num">{{ p.rate }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="note">No strategies yet.</p>
    </section>

    <section>
      <h4>Sourcing</h4>
      <table v-if="contracts.length" class="pinout">
        <tbody>
          <tr v-for="c in contracts" :key="c.id">
            <td>{{ c.name }} <span v-if="c.risky" class="bad">· risky</span></td>
            <td class="num">{{ fmtCount(c.used) }}/{{ fmtCount(c.total) }}</td>
            <td class="num">{{ c.parts.length ? describeFlows(game.state, partsFor(u, c)) : 'made by Procurement' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="note warn">None yet: you can’t own any until you Procure some.</p>
      <p class="note">Can exist: {{ ceilingLabel('unit', u.ceiling) }}</p>
    </section>

    <template #foot>
      <button class="small" @click="ui.openInvent({ kind: 'strategy', unitId: u.id })">+ Strategy</button>
      <button class="small" @click="ui.openInvent({ kind: 'create', unitId: u.id })">Procure</button>
      <button
        class="small"
        :disabled="!!lockReason(game.state, 'unit-upgrade')"
        :title="lockReason(game.state, 'unit-upgrade') ?? ''"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'unit', id: u.id } })"
      >
        Upgrade
      </button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  allocation,
  contractsFor,
  describeFlows,
  findResource,
  findUnit,
  fmt,
  fmtCount,
  labour,
  owned,
  partsFor,
  tierLabel,
  unitCap,
  unitValueText
} from '@/engine/model'
import { ceilingLabel } from '@/engine/ceilings'
import { lockReason } from '@/engine/phase'
import { strategyRate } from '@/engine/research'
import { TRAITS } from '@/engine/traits'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { boardLayout } from '../board/layout'
import { partNo } from './text'

const props = defineProps<{ id: string }>()
const game = useGameStore()
const ui = useUiStore()
const u = computed(() => findUnit(game.state, props.id))
const contracts = computed(() => contractsFor(game.state, props.id))
const name = (id: string | null, kind: 'unit' | 'resource') =>
  (id && (kind === 'unit' ? findUnit(game.state, id)?.name : findResource(game.state, id)?.name)) || '?'

const specs = computed<SpecRow[]>(() => {
  const x = u.value
  if (!x) return []
  const rows: SpecRow[] = [
    { k: 'Tier', v: tierLabel(x.tier) },
    { k: 'One is worth', v: unitValueText(x.value) },
    { k: 'Work', v: `${fmt(labour(x))} Money’s worth a week`, num: true },
    { k: 'Owned', v: `${fmtCount(owned(x))} of ${fmtCount(unitCap(game.state, x.id))}`, num: true },
    { k: 'Runs on', v: x.upkeep.length ? `${describeFlows(game.state, x.upkeep)} a week` : 'nothing' },
    { k: 'Jev', v: `${Math.round(x.plausibility * 100)}% plausible` }
  ]
  if (x.crew) rows.push({ k: 'Needs crew', v: `${x.crew.per} ${name(x.crew.unitId, 'unit')} each` })
  if (x.boosts) rows.push({ k: 'Boosts', v: name(x.boosts, 'unit') })
  if (x.byproduct) rows.push({ k: 'By-product', v: name(x.byproduct, 'resource') })
  if (x.stores) rows.push({ k: 'Stores', v: name(x.stores, 'resource') })
  if (x.overclocked) rows.push({ k: 'Overclocked', v: '×2 output, ×3 upkeep', tone: 'warn' })
  return rows
})

const pins = computed(() => {
  const x = u.value
  if (!x) return []
  const col = boardLayout(game.state, game.preview).cols.find((c) => c.id === x.id)
  const alloc = allocation(game.state, x)
  return game.state.strategies
    .filter((s) => s.unitId === x.id)
    .map((s) => {
      const rate = strategyRate(game.state, s)
      const out = findResource(game.state, s.outputId)
      const run = game.preview.runs[s.id]
      const made = s.kind === 'make' ? `${fmt(rate.amount)} ${out?.icon ?? ''}` : `crews ${fmt(s.amount)}`
      return {
        s,
        pin: col?.lanes.find((l) => l.id === s.id)?.pin ?? '—',
        count: fmtCount(alloc.byTask[s.id] ?? 0),
        rate: rate.inputs.length ? `${describeFlows(game.state, rate.inputs)} → ${made}` : made,
        tone: run && run.units > 0 && run.fraction < 0.999 ? 'warn' : ''
      }
    })
})
</script>

<style scoped>
.trait + .trait {
  margin-top: 6px;
}

.trait p {
  font-size: 12px;
}

.pinout {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.pinout th {
  text-align: left;
  font-family: var(--font-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 11px;
  color: var(--ink-2);
}

.pinout td {
  padding: 2px 4px 2px 0;
  border-top: 1px dotted var(--rule);
  vertical-align: top;
}

.pinout tr.warn td {
  color: #8a5300;
}
</style>
