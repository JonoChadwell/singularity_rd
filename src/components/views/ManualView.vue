<template>
  <div class="manual">
    <nav class="toc" aria-label="Contents">
      <span class="silk">Contents</span>
      <a v-for="c in CARDS" :key="c.id" :href="`#memo-${c.id}`" :class="{ unseen: unseen(c.id) }">{{ c.title }}</a>
      <span class="silk sep">Application notes</span>
      <a v-for="(n, i) in NOTES" :key="n.id" :href="`#note-${n.id}`">AN-{{ String(i + 1).padStart(2, '0') }} {{ n.title }}</a>
    </nav>

    <div class="pages">
      <DataSheet part="MEMO" title="Memos" subtitle="What the lab left on the bench for you, as each part of the game opens.">
        <section v-for="c in CARDS" :id="`memo-${c.id}`" :key="c.id" class="memo" :class="{ unseen: unseen(c.id) }">
          <h4>
            {{ c.title }}
            <span v-if="unseen(c.id)" class="new">New</span>
          </h4>
          <p>{{ c.text }}</p>
          <button v-if="unseen(c.id)" class="small" @click="game.dismissCard(c.id)">Got it</button>
        </section>
      </DataSheet>

      <DataSheet
        v-for="(n, i) in NOTES"
        :id="`note-${n.id}`"
        :key="n.id"
        :part="`AN-${String(i + 1).padStart(2, '0')}`"
        :title="n.title"
      >
        <p>{{ n.text }}</p>
      </DataSheet>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CARDS } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import { NOTES } from '../dialogs/copy'
import DataSheet from '../kit/DataSheet.vue'

const game = useGameStore()
/** A memo that applies now and hasn't been dismissed. */
const unseen = (id: string) => game.cards.some((c) => c.id === id)
</script>

<style scoped>
.manual {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.toc {
  position: sticky;
  top: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12.5px;
}

.toc a {
  color: var(--text);
  text-decoration: none;
  padding: 1px 4px;
  border-left: 2px solid transparent;
}

.toc a:hover {
  border-left-color: var(--copper-hi);
  color: var(--copper-hi);
}

.toc a.unseen {
  color: var(--led-a);
}

.sep {
  margin-top: 10px;
}

.pages {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 760px;
}

.memo + .memo {
  margin-top: 6px;
}

.memo:not(.unseen) {
  opacity: 0.8;
}

.new {
  font-size: 10px;
  padding: 0 4px;
  background: var(--led-a);
  color: var(--ink);
  margin-left: 6px;
}

@media (max-width: 760px) {
  .manual {
    grid-template-columns: minmax(0, 1fr);
  }
  .toc {
    position: static;
  }
}
</style>
