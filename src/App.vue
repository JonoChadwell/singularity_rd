<template>
  <div class="bench">
    <TopBar />
    <StatusLine />

    <GameOver v-if="game.state.phase.status === 'lost'" />
    <main v-else class="grid" :class="{ drawer: ui.sheets.length > 0 }">
      <SidePanel class="left" />
      <section class="center">
        <ViewTabs />
        <div class="view">
          <CircuitBoard v-if="ui.tab === 'board'" />
          <ResearchPanel v-else-if="ui.tab === 'research'" />
          <ExplainerCards v-else-if="ui.tab === 'manual'" />
          <WeekReport v-else />
        </div>
      </section>
      <DatasheetDrawer class="right" />
    </main>

    <PlanDialog v-if="game.state.phase.status === 'planning'" :key="`plan-${game.state.phase.n}`" />
    <UpgradeDialog v-else-if="ui.invent?.kind === 'upgrade'" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
    <ProposalDialog v-else-if="ui.invent" :key="JSON.stringify(ui.invent)" :request="ui.invent" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import CircuitBoard from '@/components/board/CircuitBoard.vue'
import ExplainerCards from '@/components/ExplainerCards.vue'
import GameOver from '@/components/GameOver.vue'
import PlanDialog from '@/components/PlanDialog.vue'
import ProposalDialog from '@/components/ProposalDialog.vue'
import ResearchPanel from '@/components/ResearchPanel.vue'
import DatasheetDrawer from '@/components/sheets/DatasheetDrawer.vue'
import SidePanel from '@/components/shell/SidePanel.vue'
import StatusLine from '@/components/shell/StatusLine.vue'
import TopBar from '@/components/shell/TopBar.vue'
import ViewTabs from '@/components/shell/ViewTabs.vue'
import UpgradeDialog from '@/components/UpgradeDialog.vue'
import WeekReport from '@/components/WeekReport.vue'

const game = useGameStore()
const ui = useUiStore()
onMounted(() => game.checkJev())
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

.grid.drawer {
  grid-template-columns: 290px minmax(0, 1fr) 380px;
}

.left,
.right {
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

@media (max-width: 1150px) {
  .grid.drawer {
    grid-template-columns: 290px minmax(0, 1fr);
  }
  .right {
    position: fixed;
    top: 8px;
    right: 8px;
    width: min(400px, calc(100vw - 16px));
    z-index: 40;
  }
}

@media (max-width: 760px) {
  .grid,
  .grid.drawer {
    grid-template-columns: minmax(0, 1fr);
  }
  .left {
    position: static;
  }
}
</style>
