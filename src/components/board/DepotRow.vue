<template>
  <div class="depot" :data-depot="depot.id">
    <div class="top">
      <button type="button" class="dname link" :title="`${depot.name}: open its datasheet`" @click="ui.openSheet({ kind: 'depot', id: depot.id })">
        <span class="icon">{{ depot.icon }}</span> {{ depot.name }}
      </button>
      <span class="num count">×{{ fmtCount(depot.count) }}</span>
    </div>
    <div class="spec num">each holds {{ fmt(depot.holds) }} · all add +{{ fmt(depotRoom(depot)) }}</div>
    <template v-if="left > 0">
      <div class="spec num">parts each {{ depot.parts.length ? describeFlows(game.state, depot.parts) : 'nothing' }}</div>
      <div class="ctl">
        <input
          :value="n"
          class="n"
          type="number"
          min="1"
          :aria-label="`How many ${depot.name} to build`"
          @input="count = Number(($event.target as HTMLInputElement).value)"
        />
        <button class="small" :disabled="!canBuild" @click="game.buildDepots(depot.id, n)">Build {{ fmtCount(n) }}</button>
        <button
          v-if="enough && enough.more > 0"
          class="link"
          :title="`As many as it takes to hold ${fmt(enough.target.amount)}: ${enough.target.why}`"
          @click="count = enough.more"
        >
          enough {{ fmtCount(enough.more) }}
        </button>
        <button class="link" :disabled="!max" title="The most you can pay the parts for right now" @click="count = max">max {{ fmtCount(max) }}</button>
      </div>
      <p v-if="short" class="short">You need {{ short }}.</p>
    </template>
    <span v-else class="lbl">Full: these hold all that can exist</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createCost } from '@/engine/actions'
import { depotsToTarget } from '@/engine/depotProposal'
import { costShortfall, depotAffordable, depotLimit, depotRoom, describeFlows, fmt, fmtCount } from '@/engine/model'
import type { Depot } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ depot: Depot }>()
const game = useGameStore()
const ui = useUiStore()
/** How many to build. */
const count = ref(1)
const n = computed(() => Math.max(0, Math.floor(count.value)))
const left = computed(() => Math.max(0, depotLimit(game.state, props.depot) - props.depot.count))
const max = computed(() => depotAffordable(game.state, props.depot))
const enough = computed(() => depotsToTarget(game.state, props.depot, game.preview))
const short = computed(() => (n.value ? costShortfall(game.state, createCost(props.depot.parts, n.value)) : null))
const canBuild = computed(() => n.value >= 1 && n.value <= left.value && !short.value)
</script>

<style scoped>
.depot {
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

.dname {
  flex: 1;
  min-width: 0;
  padding: 0;
  text-align: left;
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-size: 13px;
  color: var(--lcd-fg);
  white-space: nowrap;
}

.spec {
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
