<template>
  <div v-if="left !== null" class="clock" :title="`The plan fails (${loss.name}) when this reaches 0`">
    <span class="lbl">{{ loss.name }} in</span>
    <Readout :value="Math.max(0, left)" :digits="3" :tone="urgent ? 'bad' : left <= 6 ? 'warn' : undefined" :blink="urgent" />
    <span class="lbl">week{{ left === 1 ? '' : 's' }}</span>
    <span v-if="lost || gained" class="moved num" title="Weeks the clock has moved so far">
      <span v-if="lost" class="bad">−{{ lost }}</span>
      <span v-if="gained" class="good">+{{ gained }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { lossOf } from '@/engine/losses'
import { clockMoved, weeksLeft } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import Readout from '../kit/LcdReadout.vue'

const game = useGameStore()
const loss = computed(() => lossOf(game.state))
const left = computed(() => weeksLeft(game.state))
const urgent = computed(() => left.value !== null && left.value <= 3)
const lost = computed(() => clockMoved(game.state, -1))
const gained = computed(() => clockMoved(game.state, 1))
</script>

<style scoped>
.clock {
  display: flex;
  align-items: center;
  gap: 6px;
}

.moved {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  line-height: 1.1;
}
</style>
