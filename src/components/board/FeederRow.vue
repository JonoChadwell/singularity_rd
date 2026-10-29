<template>
  <div class="feeder">
    <div class="top">
      <span class="reel" aria-hidden="true" />
      <span class="cname">{{ contract.name }}</span>
      <span class="num used">{{ fmtCount(contract.used) }}/{{ fmtCount(contract.total) }}</span>
      <span v-if="contract.risky" class="chip bad">risky</span>
    </div>
    <template v-if="contract.parts.length && openSlots(contract) > 0">
      <div class="parts num">each {{ describeFlows(game.state, partsFor(unit, contract)) }}</div>
      <div class="ctl">
        <input
          :value="n"
          class="n"
          type="number"
          min="1"
          :aria-label="`How many to create from ${contract.name}`"
          @input="count = Number(($event.target as HTMLInputElement).value)"
        />
        <button class="small" :disabled="!canCreate" @click="game.createUnits(contract.id, n)">Create {{ fmtCount(n) }}</button>
        <button v-if="enough" class="link" title="As many as it takes to hold what you're storing towards" @click="count = enough">enough {{ fmtCount(enough) }}</button>
        <button class="link" :disabled="!max" title="The most you can pay the parts for right now" @click="count = max">max {{ fmtCount(max) }}</button>
        <button
          class="link"
          :disabled="!safe"
          title="The most you can make while still paying next week's upkeep and every other drain, plus a week of upkeep for the new ones"
          @click="count = safe"
        >
          affordable {{ fmtCount(safe) }}
        </button>
      </div>
      <p v-if="short" class="short">You need {{ short }}.</p>
    </template>
    <span v-else class="lbl">{{ contract.parts.length ? 'full' : 'made by Procurement' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createCost } from '@/engine/actions'
import { affordable, costShortfall, creatable, describeFlows, fmtCount, openSlots, partsFor, weeklyUse } from '@/engine/model'
import type { Sourcing, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'

/** `want`: for a depot, how many more it takes to hold what you're storing towards. */
const props = defineProps<{ contract: Sourcing; unit: UnitType; want?: number }>()
const game = useGameStore()
/** How many to create. */
const count = ref(1)
const n = computed(() => Math.max(0, Math.floor(count.value)))
const max = computed(() => affordable(game.state, props.contract))
const safe = computed(() => creatable(game.state, props.contract, weeklyUse(game.preview)))
const short = computed(() => (n.value ? costShortfall(game.state, createCost(partsFor(props.unit, props.contract), n.value)) : null))
const canCreate = computed(() => n.value >= 1 && n.value <= openSlots(props.contract) && !short.value)
const enough = computed(() => Math.min(props.want ?? 0, openSlots(props.contract)))
</script>

<style scoped>
.feeder {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px 6px;
  background: rgb(0 0 0 / 0.35);
  border: 1px dashed var(--chip-edge);
}

.top {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* A tape reel: where new units are fed from. */
.reel {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--silk-dim);
  background: radial-gradient(circle, var(--silk-dim) 0 2px, transparent 2.5px);
}

.cname {
  flex: 1;
  min-width: 0;
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.used {
  font-size: 11px;
  color: var(--lcd-fg);
}

.parts {
  font-size: 10.5px;
  color: var(--silk-dim);
}

.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.n {
  width: 4.5em;
  padding: 1px 4px;
  font-size: 12px;
}

.short {
  margin: 0;
  font-size: 11px;
  color: var(--led-a);
}
</style>
