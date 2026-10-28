<template>
  <aside v-if="top" class="drawer" aria-label="Datasheet" @keydown.esc="ui.closeSheets()">
    <div class="bar">
      <button v-if="ui.sheets.length > 1" type="button" class="small" @click="ui.backSheet()">← Back</button>
      <span class="lbl">Datasheet {{ ui.sheets.length > 1 ? `${ui.sheets.length}` : '' }}</span>
      <button type="button" class="small close" aria-label="Close datasheet" @click="ui.closeSheets()">✕</button>
    </div>
    <div class="paper">
      <ResourceSheet v-if="top.kind === 'resource'" :id="top.id" :draft="top.draft" :key="`r-${top.id}`" />
      <UnitSheet v-else-if="top.kind === 'unit'" :id="top.id" :key="`u-${top.id}`" />
      <MindSheet v-else-if="top.kind === 'mind'" :id="top.id" :key="`m-${top.id}`" />
      <StrategySheet v-else-if="top.kind === 'strategy'" :id="top.id" :key="`s-${top.id}`" />
      <ResearchSheet v-else-if="top.kind === 'research'" :id="top.id" :key="`w-${top.id}`" />
      <TraitSheet v-else-if="top.kind === 'trait' || top.kind === 'rtrait' || top.kind === 'ctrait'" :kind="top.kind" :id="top.id" />
      <JevSheet v-else-if="top.kind === 'jev'" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import JevSheet from './JevSheet.vue'
import MindSheet from './MindSheet.vue'
import ResearchSheet from './ResearchSheet.vue'
import ResourceSheet from './ResourceSheet.vue'
import StrategySheet from './StrategySheet.vue'
import TraitSheet from './TraitSheet.vue'
import UnitSheet from './UnitSheet.vue'

const ui = useUiStore()
const top = computed(() => ui.sheets[ui.sheets.length - 1])
</script>

<style scoped>
.drawer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-height: calc(100vh - 16px);
  padding: 6px;
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-hi), 0 8px 24px rgb(0 0 0 / 0.5);
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar .lbl {
  flex: 1;
}

.paper {
  overflow-y: auto;
  min-height: 0;
}
</style>
