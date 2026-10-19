<template>
  <div v-if="game.jev.kind !== 'ready'" class="banner" :class="game.jev.kind">
    <template v-if="game.jev.kind === 'checking'">Connecting to Jev…</template>
    <template v-else-if="game.jev.kind === 'unconfigured'">
      <strong>Jev isn’t configured.</strong> Weeks still run, but proposing resources, units, strategies and breakthroughs needs Jev. Create
      <code>.env.local</code> in the project root with
      <code>JEV_API_KEY=&lt;your OpenRouter key&gt;</code>, restart <code>npm run dev</code>, then
      <button @click="game.checkJev()">retry</button>
    </template>
    <template v-else>
      <strong>Can’t reach Jev.</strong> {{ game.jev.message }}
      <button @click="game.checkJev()">Retry</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '@/stores/game'

const game = useGameStore()
</script>

<style scoped>
.banner {
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--warn);
  background: rgb(251 191 36 / 0.08);
}

.banner.checking {
  border-color: var(--border);
  background: var(--panel);
  color: var(--muted);
}

.banner.error {
  border-color: var(--bad);
  background: rgb(248 113 113 / 0.08);
}

code {
  font-family: var(--mono);
  background: var(--bg);
  padding: 1px 5px;
  border-radius: 4px;
}

button {
  margin-left: 6px;
  padding: 2px 10px;
}
</style>
