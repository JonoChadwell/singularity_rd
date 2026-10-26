<template>
  <div class="bench">
    <TopBar />
    <StatusLine />

    <GameOver v-if="game.state.phase.status === 'lost'" />
    <main v-else class="grid">
      <SidePanel class="left" />
      <section class="center">
        <ViewTabs />
        <div class="view">
          <template v-if="ui.tab === 'board'">
            <ResourcePanel />
            <p v-if="mindLock" class="muted small locked">🔒 New platforms: {{ mindLock }}</p>
            <MindCard v-for="m in game.state.minds" :key="m.id" :mind="m" />
            <p v-if="unitLock" class="empty">🔒 Industry: {{ unitLock }}</p>
            <p v-else-if="game.state.phase.firstUnit" class="empty">
              Your plan’s first unit, {{ game.state.phase.firstUnit.name }}, is waiting.
              <button class="link" @click="ui.openFirstUnit()">Design it (free)</button>
            </p>
            <UnitCard v-for="u in game.state.units" :key="u.id" :unit="u" />
          </template>
          <ResearchPanel v-else-if="ui.tab === 'research'" />
          <ExplainerCards v-else-if="ui.tab === 'manual'" />
          <WeekReport v-else />
        </div>
      </section>
    </main>

    <PlanDialog v-if="game.state.phase.status === 'planning'" :key="`plan-${game.state.phase.n}`" />
    <UpgradeDialog v-else-if="ui.invent?.kind === 'upgrade'" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
    <ProposalDialog v-else-if="ui.invent" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import ExplainerCards from '@/components/ExplainerCards.vue'
import GameOver from '@/components/GameOver.vue'
import MindCard from '@/components/MindCard.vue'
import PlanDialog from '@/components/PlanDialog.vue'
import ProposalDialog from '@/components/ProposalDialog.vue'
import ResearchPanel from '@/components/ResearchPanel.vue'
import ResourcePanel from '@/components/ResourcePanel.vue'
import UnitCard from '@/components/UnitCard.vue'
import UpgradeDialog from '@/components/UpgradeDialog.vue'
import WeekReport from '@/components/WeekReport.vue'
import SidePanel from '@/components/shell/SidePanel.vue'
import StatusLine from '@/components/shell/StatusLine.vue'
import TopBar from '@/components/shell/TopBar.vue'
import ViewTabs from '@/components/shell/ViewTabs.vue'
import { lockReason } from '@/engine/phase'

const game = useGameStore()
const ui = useUiStore()
onMounted(() => game.checkJev())
const mindLock = computed(() => lockReason(game.state, 'mind'))
const unitLock = computed(() => lockReason(game.state, 'unit'))
</script>

<style scoped>
.bench {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100vh;
}

.grid {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 0 12px 16px;
}

.left {
  position: sticky;
  top: 8px;
}

.center {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.view {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-hi), inset -1px -1px 0 var(--bevel-lo);
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .left {
    position: static;
  }
}
</style>
