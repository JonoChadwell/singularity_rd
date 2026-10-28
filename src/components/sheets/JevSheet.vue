<template>
  <DataSheet part="JEV-001" title="Jev" subtitle="An AI decision engine that judges your proposals.">
    <section>
      <h4>Status</h4>
      <SpecTable :rows="rows" />
    </section>
    <section v-if="game.jev.kind === 'unconfigured' || game.jev.kind === 'error'">
      <h4>Setup</h4>
      <ol class="steps">
        <li>Create <code>.env.local</code> in the project root.</li>
        <li>Add <code>JEV_API_KEY=&lt;your OpenRouter key&gt;</code>.</li>
        <li>Restart <code>npm run dev</code>.</li>
        <li>Press Retry.</li>
      </ol>
      <p class="note">Weeks still run without Jev; proposals and upgrades need it.</p>
    </section>
    <section>
      <h4>Notes</h4>
      <p class="note">
        Jev is an AI model that gives numeric answers to written questions. Jev takes your written content and answers a set of
        questions to decide how to translate the proposal into game mechanics. It never writes text of its own, so every name
        in the game comes from you or from a fixed list.
      </p>
    </section>
    <template #foot>
      <button class="small" :disabled="game.jev.kind === 'checking'" @click="game.checkJev()">Retry</button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'

const game = useGameStore()
const rows = computed<SpecRow[]>(() => {
  const j = game.jev
  const status: SpecRow =
    j.kind === 'ready'
      ? { k: 'Link', v: 'Online', tone: 'good' }
      : j.kind === 'checking'
        ? { k: 'Link', v: 'Connecting…', tone: 'warn' }
        : j.kind === 'unconfigured'
          ? { k: 'Link', v: 'Not configured', tone: 'bad' }
          : { k: 'Link', v: `Error: ${j.message}`, tone: 'bad' }
  const out = [status]
  if (j.kind === 'ready') out.push({ k: 'Model', v: j.model })
  out.push({ k: 'Calls so far', v: String(game.state.stats.jevCalls), num: true } as SpecRow)
  return out
})
</script>

<style scoped>
.steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
}

code {
  background: rgb(0 0 0 / 0.08);
}
</style>
