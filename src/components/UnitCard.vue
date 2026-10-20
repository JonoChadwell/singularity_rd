<template>
  <article ref="card" class="card" :class="{ focus: ui.focus === unit.id }">
    <header class="head">
      <span class="icon">{{ unit.icon }}</span>
      <div class="title">
        <div class="name">
          <strong>{{ unit.name }}</strong>
          <span v-if="unit.tier" class="chip tier">Tier {{ unit.tier }}</span>
          <span
            v-if="unit.mind"
            class="chip iq"
            :title="`${unit.hardware.name} hardware, IQ ${unit.hardware.iq}, running ${softwareLabel(unit)}. Software upgrades can raise it to ${Math.round(ceilingIQ(unit))}; past that needs new hardware.`"
          >
            IQ {{ Math.round(currentIQ(unit)) }}<span class="muted"> / {{ Math.round(ceilingIQ(unit)) }}</span>
          </span>
          <TraitChips :traits="unit.traits" :unit="unit" />
        </div>
        <div class="muted small desc">{{ unit.description }}</div>
      </div>
      <div class="count num" :title="unit.starting ? 'There’s only ever one' : 'Owned / supply limit'">
        {{ fmtCount(unit.count) }}<span v-if="!unit.starting" class="cap">/{{ fmtCount(limit) }}</span>
        <div v-if="pending" class="small muted">+{{ fmtCount(pending) }} on the way</div>
      </div>
    </header>

    <div class="facts small muted">
      <span v-if="unit.mind">🔩 {{ unit.hardware.name }} · 💾 {{ softwareLabel(unit) }} ·</span>
      <span>{{ unit.upkeep.length ? `Runs on ${describeFlows(game.state, unit.upkeep)} a week` : 'No upkeep' }}</span>
      <span v-if="!unit.starting">· Jev: {{ Math.round(unit.plausibility * 100) }}% plausible</span>
      <span v-if="unit.crew">· Each needs {{ unit.crew.per }} {{ unitName(unit.crew.unitId) }}</span>
      <label v-if="has(unit, 'overclockable')" class="oc">
        <input type="checkbox" :checked="unit.overclocked" @change="game.setOverclock(unit.id, !unit.overclocked)" />
        Overclock (×2 output, ×3 upkeep)
      </label>
    </div>

    <div v-if="!unit.starting" class="layers" :title="layerTitle">
      <div
        v-for="l in layers"
        :key="l.layer"
        class="layer"
        :class="[l.layer, { locked: !l.size }]"
        :style="{ flexGrow: l.size ? Math.log10(l.size + 1) : 0.6 }"
      >
        <div class="fill" :style="{ width: `${l.fill * 100}%` }" />
        <span class="small">{{ LAYER_NAMES[l.layer] }} {{ l.size ? fmtCount(l.size) : '🔒' }}</span>
      </div>
    </div>

    <div v-if="left > 0" class="buy row small">
      <span class="muted">Humanity sells {{ fmtCount(left) }} more at {{ fmt(price) }} each, rising.</span>
      <input v-model.number="buyN" class="n" type="number" min="1" :max="left" aria-label="How many to buy" />
      <button class="small" :disabled="!game.playing || buyN < 1 || cost > money" @click="game.buyUnits(unit.id, buyN)">
        Buy for {{ fmt(cost) }}
      </button>
      <button
        class="link"
        :disabled="!maxBuy"
        title="The most you can buy while keeping next week’s Money upkeep, theirs included"
        @click="buyN = maxBuy"
      >
        max {{ fmtCount(maxBuy) }}
      </button>
      <span v-if="cost > money" class="warn">You need {{ fmt(cost - money) }} more Money.</span>
    </div>
    <p v-else-if="soldOut" class="small warn wall">
      Humanity has no more to sell. How will you make your own?
      <button
        class="link"
        @click="ui.openInvent({ kind: 'breakthrough', target: { kind: 'unit', id: unit.id }, change: 'layer' })"
      >
        Make your own
      </button>
    </p>

    <ul v-if="warnings.length" class="plain-list warnings small">
      <li v-for="w in warnings" :key="w" class="warn">{{ w }}</li>
    </ul>

    <TaskList :unit="unit" />

    <footer class="row foot">
      <button class="link" @click="ui.openInvent({ kind: 'strategy', unitId: unit.id })">+ strategy</button>
      <button class="link" @click="ui.openInvent({ kind: 'breakthrough', target: { kind: 'unit', id: unit.id } })">
        + breakthrough
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  affordable,
  ceilingIQ,
  currentIQ,
  softwareLabel,
  describeFlows,
  findResource,
  findUnit,
  fmt,
  fmtCount,
  layerSize,
  marketCost,
  marketLeft,
  marketPrice,
  MONEY_ID,
  moneyUse,
  unitLimit
} from '@/engine/model'
import { has } from '@/engine/traits'
import { LAYERS, type UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import TaskList from './TaskList.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ unit: UnitType }>()
const game = useGameStore()
const ui = useUiStore()
const card = ref<HTMLElement>()

const LAYER_NAMES = { market: 'Humanity', own: 'Own industry', earth: 'Earth' }

const limit = computed(() => unitLimit(props.unit))
const pending = computed(() => props.unit.pending.reduce((n, p) => n + p.count, 0))
const left = computed(() => marketLeft(props.unit))
const price = computed(() => marketPrice(props.unit))
const money = computed(() => findResource(game.state, MONEY_ID)?.amount ?? 0)
const buyN = ref(1)
const cost = computed(() => marketCost(props.unit, Math.min(buyN.value || 0, left.value)))
const maxBuy = computed(() => affordable(props.unit, money.value, moneyUse(game.preview)))
const soldOut = computed(
  () => layerSize(props.unit, 'market') > 0 && props.unit.bought >= layerSize(props.unit, 'market') && !props.unit.layers.own
)
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'

const layers = computed(() => {
  let below = 0
  const owned = props.unit.count
  return LAYERS.map((layer) => {
    const size = layerSize(props.unit, layer)
    const fill = size ? Math.min(1, Math.max(0, owned - below) / size) : 0
    below += size
    return { layer, size, fill }
  })
})
const layerTitle = computed(
  () =>
    'Supply layers: humanity’s market, your own industry, then Earth’s limit. Each one is a wall; a breakthrough opens the next.'
)

const warnings = computed(() => {
  const w = game.preview.units[props.unit.id]
  if (!w) return []
  const out: string[] = []
  if (w.resting) out.push('Resting this week (Intermittent).')
  if (w.choked) out.push('Stopped: waste has piled up past the limit.')
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

.count .cap {
  font-size: 12px;
  color: var(--muted);
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

.layers {
  display: flex;
  gap: 3px;
}

.layer {
  position: relative;
  flex-basis: 0;
  min-width: 70px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg);
}

.layer.locked {
  border-style: dashed;
  opacity: 0.6;
}

.layer .fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent-dim);
}

.layer.own .fill {
  background: rgb(167 139 250 / 0.35);
}

.layer.earth .fill {
  background: rgb(251 191 36 / 0.3);
}

.layer span {
  position: relative;
  padding: 0 6px;
  line-height: 16px;
  white-space: nowrap;
  font-size: 11px;
}

.buy {
  gap: 6px;
}

.wall {
  margin: 0;
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
