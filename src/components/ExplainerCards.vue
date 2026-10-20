<template>
  <div v-if="game.cards.length" class="cards">
    <article v-for="c in game.cards" :key="c.id" class="card">
      <div class="text">
        <strong>{{ c.title }}</strong>
        <p class="small">{{ c.text }}</p>
      </div>
      <button class="small" @click="game.dismissCard(c.id)">Got it</button>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '@/stores/game'

const game = useGameStore()
</script>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  border: 1px solid var(--accent-dim);
  background: rgb(110 231 183 / 0.06);
  border-radius: var(--radius);
  padding: 10px 12px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.text {
  flex: 1;
}

.text p {
  margin: 4px 0 0;
}
</style>
