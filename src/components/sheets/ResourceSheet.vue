<template>
  <DataSheet v-if="r" :part="partNo('RES', r.id)" :title="r.name" :icon="r.icon" :subtitle="r.description">
    <section>
      <h4>Specifications</h4>
      <SpecTable :rows="specs" />
    </section>

    <section v-if="r.traits.length">
      <h4>Nature</h4>
      <div v-for="t in r.traits" :key="t" class="trait">
        <button type="button" class="link" @click="ui.openSheet({ kind: 'rtrait', id: t }, true)">
          {{ resourceTrait(t).icon }} {{ resourceTrait(t).name }}
        </button>
        <p class="good">▲ {{ resourceTrait(t).upside }}</p>
        <p class="bad">▼ {{ resourceTrait(t).downside }}</p>
        <p v-if="t === 'speculative'" class="note">Value varies week to week. Currently ×{{ speculativeFactor(game.state, r.id).toFixed(2) }}.</p>
      </div>
    </section>

    <section>
      <h4>Storage</h4>
      <SpecTable
        :rows="[
          { k: 'To start', v: fmt(r.cap), num: true },
          ...depotsFor(game.state, r.id).map((d) => ({
            k: `${d.icon} ${d.name} ×${fmtCount(d.count)}`,
            v: `+${fmt(depotRoom(d))}`,
            num: true,
            open: () => ui.openSheet({ kind: 'depot', id: d.id }, true)
          })),
          { k: 'Storage', v: fmt(cap), num: true },
          { k: 'Maximum Storage Limit', v: ceilingLabel(r.ceiling) }
        ]"
      />
    </section>

    <section>
      <h4>Next week</h4>
      <table v-if="flows.length" class="flows">
        <tbody>
          <tr v-for="f in flows" :key="f.label">
            <td>{{ f.label }}</td>
            <td class="num" :class="f.amount >= 0 ? 'good' : 'bad'">{{ signed(f.amount) }}</td>
          </tr>
          <tr class="total">
            <td>Net</td>
            <td class="num">{{ signed(netFlow(game.preview, r.id)) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="note">Nothing makes or uses this next week.</p>
    </section>

    <section v-if="pending.length">
      <h4>Still to come</h4>
      <table class="flows">
        <tbody>
          <tr v-for="(d, i) in pending" :key="i">
            <td>{{ d.name }} <span class="note">· {{ deliveryTiming(d) }}</span></td>
            <td class="num good">+{{ fmt(d.amount) }}{{ d.weeks === 1 ? '' : '/wk' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <template v-if="!draft" #foot>
      <button class="small" :disabled="!!lockReason(game.state, 'create')" @click="ui.openInvent({ kind: 'create', outputId: r.id })">+ Procure</button>
      <button class="small" :disabled="!!lockReason(game.state, 'storage')" @click="ui.openInvent({ kind: 'storage', resourceId: r.id })">+ Depot</button>
      <button v-if="!lockReason(game.state, 'strategy')" class="small" @click="ui.openInvent({ kind: 'strategy', outputId: r.id })">+ Strategy</button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Resource } from '@/engine/types'
import { ceilingLabel } from '@/engine/ceilings'
import { netFlow } from '@/engine/economy'
import { bandText, capOf, deliveryTiming, depotRoom, depotsFor, findResource, fmt, fmtCount, tierText } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { resourceTrait, speculativeFactor } from '@/engine/resourceTraits'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { partNo } from './text'

const props = defineProps<{ id: string; draft?: Resource }>()
const game = useGameStore()
const ui = useUiStore()
const r = computed(() => findResource(game.state, props.id) ?? props.draft)
const cap = computed(() => (r.value ? capOf(game.state, r.value) : 0))
const flows = computed(() => game.preview.flows[props.id] ?? [])
const pending = computed(() =>
  game.state.deliveries.filter((d) => d.target.kind === 'resource' && d.target.id === props.id).sort((a, b) => a.delay - b.delay)
)
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`

const specs = computed<SpecRow[]>(() => {
  const x = r.value
  if (!x) return []
  const rows: SpecRow[] = [
    { k: 'Tier', v: tierText(x) },
    { k: 'One is worth', v: bandText(x) },
    { k: 'In stock', v: `${fmt(x.amount)} / ${fmt(cap.value)}`, num: true, tone: x.amount >= cap.value * 0.999 ? 'warn' : undefined }
  ]
  const wasted = game.preview.wasted[x.id] ?? 0
  if (wasted > 0) rows.push({ k: 'Overflows', v: `${fmt(wasted)} next week`, tone: 'bad', num: true })
  const share = game.preview.shares[x.id] ?? 1
  if (share < 0.999) rows.push({ k: 'Short', v: `Users run at ${Math.round(share * 100)}%`, tone: 'bad' })
  return rows
})
</script>

<style scoped>
.trait + .trait {
  margin-top: 6px;
}

.trait p {
  font-size: 12px;
}

.flows {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.flows td {
  padding: 2px 0;
  border-top: 1px dotted var(--rule);
}

.flows td.num {
  text-align: right;
}

.flows .total td {
  border-top: 2px solid var(--ink);
  font-weight: 600;
}
</style>
