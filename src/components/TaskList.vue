<template>
  <div class="tasks">
    <p v-if="!rows.length" class="empty">
      No strategies yet.
      <button class="link" @click="ui.openInvent({ kind: 'strategy', unitId: unit.id })">+ strategy</button>
    </p>
    <div v-for="row in rows" :key="row.id" class="task" :class="{ off: !row.count && !row.rest }">
      <AssignControl
        v-if="unit.count > 1 || row.count === 0 || !row.rest"
        :count="row.count"
        :max="unit.count"
        :rest="row.rest"
        :label="row.name"
        @set="(n) => game.assign(unit.id, row.id, n)"
        @rest="(on) => game.assignRest(unit.id, on ? row.id : null)"
      />
      <span v-else class="chip on-it">on it</span>
      <div class="what">
        <div class="name">
          {{ row.icon }} {{ row.name }}
          <span v-if="row.strategy.quirk" class="chip quirk" :title="QUIRKS[row.strategy.quirk].rule">
            {{ QUIRKS[row.strategy.quirk].icon }} {{ QUIRKS[row.strategy.quirk].name }}
          </span>
          <button
            v-if="unit.count > 1 && row.count < unit.count"
            class="link"
            title="Move every machine of this type here"
            @click="game.assignAll(unit.id, row.id)"
          >
            all
          </button>
          <button v-else-if="unit.count === 1 && !row.count" class="link" @click="game.assignAll(unit.id, row.id)">
            do this
          </button>
        </div>
        <div class="detail small muted">
          <template v-if="row.strategy.kind === 'make'">
            {{ perUnit(row.strategy) }} each a week
            <span v-if="run(row.id)" :class="{ warn: run(row.id)!.fraction < 0.999 }">
              · {{ fmtCount(run(row.id)!.units) }} running
              <template v-if="run(row.id)!.fraction < 0.999">
                at {{ Math.round(run(row.id)!.fraction * 100) }}%<template v-if="run(row.id)!.limitedBy">, short of {{ resName(run(row.id)!.limitedBy!) }}</template>
              </template>
            </span>
          </template>
          <template v-else-if="row.strategy.kind === 'build'">
            <label class="row target">
              Build until I own
              <input
                class="n"
                type="number"
                min="0"
                :value="row.strategy.target ?? 0"
                aria-label="Build target"
                @change="setTarget(row.strategy!.id, $event)"
              />
            </label>
            <div>
              From {{ partsText(row.strategy) }} each · ~{{ fmt(rateOf(row.strategy)) }} a week per builder
              <span v-if="run(row.id)"> · {{ fmtCount(run(row.id)!.units) }} building</span>
            </div>
          </template>
          <template v-else-if="row.strategy.kind === 'crew'">
            Each crews {{ fmt(row.strategy.amount) }} {{ unitName(row.strategy.outputId) }}
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { allocation, describeFlows, findResource, findUnit, fmt, fmtCount } from '@/engine/model'
import { strategyRate } from '@/engine/research'
import { QUIRKS } from '@/engine/traits'
import type { Strategy, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import AssignControl from './AssignControl.vue'

const props = defineProps<{ unit: UnitType }>()
const game = useGameStore()
const ui = useUiStore()

const alloc = computed(() => allocation(game.state, props.unit))

interface Row {
  id: string
  name: string
  icon: string
  count: number
  rest: boolean
  strategy: Strategy
}

const rows = computed<Row[]>(() => {
  const u = props.unit
  const byTask = alloc.value.byTask
  return game.state.strategies
    .filter((s) => s.unitId === u.id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.kind === 'build' ? '🔨' : s.kind === 'crew' ? '👷' : '',
      count: byTask[s.id] ?? 0,
      rest: u.rest === s.id,
      strategy: s
    }))
})

const run = (id: string) => game.preview.runs[id]
const resName = (id: string) => findResource(game.state, id)?.name ?? '?'
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'

function perUnit(s: Strategy) {
  const rate = strategyRate(game.state, s)
  const output = findResource(game.state, s.outputId)
  const made = `${fmt(rate.amount)} ${output?.icon ?? ''} ${output?.name ?? '?'}`
  return rate.inputs.length ? `${describeFlows(game.state, rate.inputs)} → ${made}` : made
}

const rateOf = (s: Strategy) => strategyRate(game.state, s).amount
function partsText(s: Strategy) {
  const target = findUnit(game.state, s.outputId)
  return target ? describeFlows(game.state, target.parts) : '?'
}

function setTarget(strategyId: string, e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) game.setBuildTarget(strategyId, n)
}
</script>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.task.off {
  opacity: 0.7;
}

.what {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.detail {
  margin-top: 2px;
}

.on-it {
  color: var(--accent);
  border-color: var(--accent-dim);
  margin-top: 3px;
}

.quirk {
  color: var(--warn);
  border-color: rgb(251 191 36 / 0.35);
  cursor: help;
}

.target {
  gap: 6px;
  margin-bottom: 2px;
}
</style>
