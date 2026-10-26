<template>
  <div
    class="pinrow"
    :class="[tone, { hot: ui.hover === strategy.id }]"
    :data-pin="strategy.id"
    @mouseenter="ui.hover = strategy.id"
    @mouseleave="ui.hover = null"
  >
    <span class="pin num" :title="pin ? `Pin ${pin}: its trace on the board` : 'Crew: no trace'">{{ pin ? `P${pin}` : 'CR' }}</span>
    <Led :tone="led" :title="ledTitle" />
    <button type="button" class="name" :title="`${strategy.name}: open its datasheet`" @click="ui.openSheet({ kind: 'strategy', id: strategy.id })">
      {{ strategy.name }}
    </button>
    <span class="marks">
      <span v-if="word" class="mark" :class="wordTone" title="How well Jev rates this way of doing it">{{ word }}</span>
      <span v-if="fit" class="mark" :class="fit.good ? 'good' : 'bad'" :title="fitTitle">{{ fit.text }}</span>
      <span v-if="strategy.quirk" class="mark warn" :title="QUIRKS[strategy.quirk].rule">{{ QUIRKS[strategy.quirk].icon }} {{ QUIRKS[strategy.quirk].name }}</span>
    </span>

    <span class="rate num">
      <template v-if="strategy.kind === 'make'">
        {{ perUnit }}<span class="muted">/u</span>
        <span v-if="run && run.fraction < 0.999 && run.units > 0" class="warn">
          · {{ Math.round(run.fraction * 100) }}%<template v-if="run.limitedBy"> short of {{ resName(run.limitedBy) }}</template>
        </span>
      </template>
      <template v-else>Crews {{ fmt(strategy.amount) }} {{ unitName(strategy.outputId) }} each</template>
    </span>

    <span class="ctl">
      <span v-if="onIt" class="on-it"><Led tone="good" /> on it</span>
      <template v-else>
        <button type="button" class="step" :disabled="rest || count <= 0" :aria-label="`One fewer on ${strategy.name}`" @click="set(count - 1)">−</button>
        <input
          class="n"
          type="number"
          min="0"
          :max="unit.count"
          :value="count"
          :disabled="rest"
          :aria-label="`Machines on ${strategy.name}`"
          @change="onChange"
        />
        <button type="button" class="step" :disabled="rest || count >= unit.count" :aria-label="`One more on ${strategy.name}`" @click="set(count + 1)">+</button>
        <button
          type="button"
          class="small rest"
          :aria-pressed="rest"
          title="Takes every machine not counted elsewhere, including new ones"
          @click="game.assignRest(unit.id, rest ? null : strategy.id)"
        >
          rest
        </button>
      </template>
      <button v-if="unit.count > 1 && count < unit.count" class="link" title="Move every machine of this type here" @click="game.assignAll(unit.id, strategy.id)">all</button>
      <button v-else-if="unit.count === 1 && !count" class="link" @click="game.assignAll(unit.id, strategy.id)">do this</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { efficiencyWord, findResource, findUnit, fmt, fmtCount, tierFit, tierLabel } from '@/engine/model'
import { effectiveTier } from '@/engine/resourceTraits'
import { strategyRate } from '@/engine/research'
import { QUIRKS } from '@/engine/traits'
import type { Strategy, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led, { type LedTone } from '../kit/StatusLed.vue'

const props = defineProps<{ strategy: Strategy; unit: UnitType; count: number; pin: number | null }>()
const game = useGameStore()
const ui = useUiStore()

const rest = computed(() => props.unit.rest === props.strategy.id)
const onIt = computed(() => props.unit.count <= 1 && rest.value && props.count > 0)
const run = computed(() => game.preview.runs[props.strategy.id])
const resName = (id: string) => findResource(game.state, id)?.name ?? '?'
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'

const tone = computed(() => {
  const r = run.value
  if (!r || r.units <= 0) return 'off'
  return r.fraction >= 0.999 ? 'ok' : r.fraction <= 0.001 ? 'bad' : 'warn'
})
const led = computed<LedTone>(() => ({ off: 'off', ok: 'good', warn: 'warn', bad: 'bad' })[tone.value] as LedTone)
const ledTitle = computed(() => {
  const r = run.value
  if (!r || r.units <= 0) return 'Nobody on it'
  return `${fmtCount(r.units)} running${r.fraction < 0.999 ? ` at ${Math.round(r.fraction * 100)}%` : ''}`
})

const perUnit = computed(() => {
  const rate = strategyRate(game.state, props.strategy)
  const out = findResource(game.state, props.strategy.outputId)
  const made = `${fmt(rate.amount)} ${out?.icon ?? ''}`
  const used = rate.inputs.map((f) => `${fmt(f.amount)} ${findResource(game.state, f.resourceId)?.icon ?? '?'}`).join(' + ')
  return used ? `${used} → ${made}` : made
})

const word = computed(() => efficiencyWord(props.strategy))
const wordTone = computed(() => {
  const e = props.strategy.efficiency ?? 1
  return e > 1 ? 'good' : e < 1 ? 'bad' : ''
})
const target = computed(() => (props.strategy.kind === 'make' ? findResource(game.state, props.strategy.outputId) : undefined))
const fit = computed(() => (target.value ? tierFit(props.unit.tier, effectiveTier(target.value, 'make')) : null))
const fitTitle = computed(() =>
  target.value ? `${props.unit.name} are ${tierLabel(props.unit.tier)}; ${target.value.name} is ${tierLabel(target.value.tier)}.` : ''
)

function set(n: number) {
  game.assign(props.unit.id, props.strategy.id, Math.max(0, Math.min(props.unit.count, n)))
}

function onChange(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) set(n)
}
</script>

<style scoped>
.pinrow {
  display: grid;
  grid-template-columns: 24px 12px minmax(0, 1fr);
  gap: 2px 6px;
  align-items: center;
  padding: 4px 6px;
  background: rgb(255 255 255 / 0.03);
  border-left: 2px solid var(--copper);
}

.pinrow.off {
  border-left-color: var(--chip-edge);
}

.pinrow.warn {
  border-left-color: var(--led-a);
}

.pinrow.bad {
  border-left-color: var(--led-r);
}

.pinrow.hot {
  background: rgb(232 182 92 / 0.1);
}

.pin {
  font-size: 10px;
  color: var(--copper-hi);
}

.name {
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--silk);
  font-size: 13px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name:hover:not(:disabled) {
  background: none;
  color: var(--copper-hi);
}

.marks,
.rate,
.ctl {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.marks:empty {
  display: none;
}

.mark {
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0 4px;
  border: 1px solid currentColor;
  color: var(--silk-dim);
}

.rate {
  font-size: 10.5px;
  color: var(--silk-dim);
}

.step {
  width: 20px;
  padding: 0;
  font-family: var(--font-mono);
}

.n {
  width: 4.2em;
  padding: 1px 4px;
  font-size: 12px;
}

.rest {
  padding: 1px 6px;
}

.on-it {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-label);
  text-transform: uppercase;
  font-size: 11px;
  color: var(--led-g);
}
</style>
