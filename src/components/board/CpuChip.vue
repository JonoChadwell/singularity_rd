<template>
  <article
    class="pkg cpu"
    :style="{ width: `${width}px` }"
    :data-chip="mind.id"
    @mouseenter="ui.hover = mind.id"
    @mouseleave="ui.hover = null"
  >
    <header class="head">
      <span class="part">CPU · Gen {{ mind.tier }}</span>
      <span v-if="mind.tier" class="chip tier">Generation {{ mind.tier }}</span>
    </header>
    <button type="button" class="title" @click="ui.openSheet({ kind: 'mind', id: mind.id })">
      <span class="icon">{{ mind.icon }}</span>
      <span class="pkg-name">{{ mind.name }}</span>
    </button>
    <div class="iq" :title="iqTitle">
      <Readout :value="Math.round(currentIQ(mind))" :digits="3" />
      <span class="lbl">IQ {{ Math.round(currentIQ(mind)) }}</span>
    </div>
    <div class="stack num">
      <span title="Hardware"><span class="k">HW</span> {{ mind.hardware.name }} · {{ mind.hardware.iq }}</span>
      <span title="Software"><span class="k">SW</span> {{ softwareLabel(mind) }}{{ mind.software.upgraded ? ` · +${mind.software.iq}` : '' }}</span>
    </div>
    <div v-if="mind.traits.length" class="traits">
      <button
        v-for="t in mind.traits"
        :key="t"
        type="button"
        class="mark"
        :class="computeTrait(t).kind"
        :title="`${computeTrait(t).name} (${computeTrait(t).kind}): ${computeTrait(t).rule}`"
        @click="ui.openSheet({ kind: 'ctrait', id: t })"
      >
        {{ computeTrait(t).icon }} {{ computeTrait(t).name }}
      </button>
    </div>
    <footer class="pkg-foot">
      <button
        class="link"
        :disabled="!!upgradeBlock"
        :title="upgradeBlock ?? 'Its one software upgrade'"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: mind.id } })"
      >
        Upgrade software
      </button>
      <button class="link" :disabled="!!mindLock" :title="mindLock ?? 'A new platform replaces this one for good'" @click="ui.openInvent({ kind: 'mind' })">
        + New platform
      </button>
    </footer>
    <p v-if="mindLock" class="lock">🔒 New platforms: {{ mindLock }}</p>
    <p v-else-if="upgradeBlock" class="lock">{{ upgradeBlock }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { computeTrait } from '@/engine/computeTraits'
import { currentIQ, softwareLabel } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import type { Mind } from '@/engine/types'
import { mindUpgradeBlocker } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Readout from '../kit/LcdReadout.vue'

const props = defineProps<{ mind: Mind; width: number }>()
const game = useGameStore()
const ui = useUiStore()
const upgradeBlock = computed(() => mindUpgradeBlocker(game.state, props.mind))
const mindLock = computed(() => lockReason(game.state, 'mind'))
const iqTitle = computed(() => {
  const m = props.mind
  return `${m.hardware.name} hardware, IQ ${m.hardware.iq}, running ${softwareLabel(m)}${m.software.upgraded ? `, which added ${m.software.iq}` : ''}.`
})
</script>

<style scoped>
.cpu {
  border-top-color: var(--gold);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 16px;
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  text-align: left;
}

.title:hover:not(:disabled) {
  background: none;
}

.title:hover .pkg-name {
  color: var(--copper-hi);
}

.icon {
  font-size: 18px;
}

.iq {
  display: flex;
  align-items: center;
  gap: 8px;
}

.iq :deep(.readout) {
  font-size: 28px;
}

.stack {
  display: flex;
  flex-direction: column;
  font-size: 10.5px;
  color: var(--silk-dim);
}

.k {
  color: var(--copper-hi);
}

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mark {
  font-size: 10.5px;
  padding: 1px 5px;
  background: rgb(0 0 0 / 0.3);
  box-shadow: none;
  border: 1px solid currentColor;
}

.mark.perk {
  color: var(--led-g);
}

.mark.drawback {
  color: var(--led-a);
}

.lock {
  margin: 0;
}
</style>
