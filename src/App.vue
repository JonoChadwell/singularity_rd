<template>
  <div class="app">
    <header class="top">
      <div class="title">
        <h1>Singularity R&amp;D</h1>
      </div>
      <button class="small" @click="confirmNewGame">New game</button>
    </header>

    <JevBanner />
    <p v-if="game.lastError && !ui.invent" class="error" role="alert">{{ game.lastError }}</p>
    <p v-if="ui.notice" class="notice" :class="ui.notice.tone" role="status">
      {{ ui.notice.text }}
      <button class="close" aria-label="Dismiss" @click="ui.notice = null">✕</button>
    </p>

    <main class="grid">
      <div class="col">
        <NextWeek />
        <ResourcePanel />
      </div>
      <section class="panel col">
        <div class="tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.id"
            role="tab"
            :aria-selected="ui.tab === t.id"
            :class="{ on: ui.tab === t.id }"
            @click="ui.tab = t.id"
          >
            {{ t.label }} <span class="num muted">{{ t.count() }}</span>
          </button>
        </div>

        <template v-if="ui.tab === 'minds'">
          <div class="tab-head">
            <p class="muted small">
              Your smartest mind sets how hard a research you can do. Each one is a single machine.
            </p>
            <button class="add" @click="ui.openInvent({ kind: 'mind' })">+ Intelligence system</button>
          </div>
          <MindCard v-for="m in minds" :key="m.id" :mind="m" />
        </template>

        <template v-else-if="ui.tab === 'industry'">
          <div class="tab-head">
            <p class="muted small">Units that make things. Each runs its strategies every week.</p>
            <button class="add" @click="ui.openInvent({ kind: 'unit' })">+ Unit</button>
          </div>
          <p v-if="!game.state.units.length" class="empty">
            No industry yet. Propose a unit: a power plant, a robot, a hired human, a lemon grove.
          </p>
          <UnitCard v-for="u in game.state.units" :key="u.id" :unit="u" />
        </template>

        <ResearchPanel v-else />
      </section>
      <div class="col">
        <WeekReport />
      </div>
    </main>

    <UpgradeDialog v-if="ui.invent?.kind === 'upgrade'" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
    <ProposalDialog v-else-if="ui.invent" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import JevBanner from '@/components/JevBanner.vue'
import MindCard from '@/components/MindCard.vue'
import NextWeek from '@/components/NextWeek.vue'
import ProposalDialog from '@/components/ProposalDialog.vue'
import ResearchPanel from '@/components/ResearchPanel.vue'
import ResourcePanel from '@/components/ResourcePanel.vue'
import UnitCard from '@/components/UnitCard.vue'
import UpgradeDialog from '@/components/UpgradeDialog.vue'
import WeekReport from '@/components/WeekReport.vue'
import { currentIQ } from '@/engine/model'

const game = useGameStore()
const ui = useUiStore()
onMounted(() => game.checkJev())

const minds = computed(() => [...game.state.minds].sort((a, b) => currentIQ(b) - currentIQ(a)))

const TABS = [
  { id: 'minds', label: 'Intelligence', count: () => minds.value.length },
  { id: 'industry', label: 'Industry', count: () => game.state.units.length },
  { id: 'research', label: 'Research', count: () => game.state.research.length }
] as const

function confirmNewGame() {
  if (game.state.week <= 1 || confirm('Abandon this AI and start over?')) game.newGame()
}
</script>

<style scoped>
.app {
  max-width: 1480px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.title {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

h1 {
  font-size: 20px;
  letter-spacing: 0.02em;
}

.error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--bad);
  color: var(--bad);
  background: rgb(248 113 113 / 0.08);
}

.notice {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--accent-dim);
  background: rgb(110 231 183 / 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.notice .close {
  border: none;
  background: transparent;
  padding: 0 4px;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tabs button.on {
  border-color: var(--accent);
  color: var(--accent);
}

.tab-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.tab-head p {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.6fr) minmax(0, 0.8fr);
  gap: 14px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

@media (max-width: 1150px) {
  .grid {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.5fr);
  }
  .grid > .col:last-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
