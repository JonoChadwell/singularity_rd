<template>
  <article class="card">
    <header class="head">
      <span class="icon">{{ mind.icon }}</span>
      <div class="title">
        <div class="name">
          <strong>{{ mind.name }}</strong>
          <span v-if="mind.tier" class="chip tier">Generation {{ mind.tier }}</span>
          <span
            class="chip iq"
            :title="`${mind.hardware.name} hardware, IQ ${mind.hardware.iq}, running ${softwareLabel(mind)}${mind.software.upgraded ? `, which added ${mind.software.iq}` : ''}.`"
          >
            IQ {{ Math.round(currentIQ(mind)) }}
          </span>
        </div>
        <div class="muted small desc">{{ mind.description }}</div>
      </div>
    </header>

    <div class="facts small muted">
      <span>🔩 {{ mind.hardware.name }} · 💾 {{ softwareLabel(mind) }}</span>
      <span v-if="!mind.starting">· Jev: {{ Math.round(mind.plausibility * 100) }}% plausible</span>
    </div>

    <div v-if="mind.traits.length" class="traits small">
      <span
        v-for="t in mind.traits"
        :key="t"
        class="chip trait"
        :class="computeTrait(t).kind"
        :title="`${computeTrait(t).name} (${computeTrait(t).kind}): ${computeTrait(t).rule}`"
      >
        {{ computeTrait(t).icon }} {{ computeTrait(t).name }}
        <span class="muted">{{ computeTrait(t).rule }}</span>
      </span>
    </div>

    <footer class="row foot">
      <button
        class="link"
        :disabled="!!blocked"
        :title="blocked ?? ''"
        @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: mind.id } })"
      >
        Upgrade software
      </button>
      <span v-if="blocked" class="muted small">{{ blocked }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { computeTrait } from '@/engine/computeTraits'
import { currentIQ, softwareLabel } from '@/engine/model'
import type { Mind } from '@/engine/types'
import { mindUpgradeBlocker } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ mind: Mind }>()
const ui = useUiStore()
const game = useGameStore()
/** Why its one software upgrade can't be proposed, if so. */
const blocked = computed(() => mindUpgradeBlocker(game.state, props.mind))
</script>

<style scoped>
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--panel-raised);
}

.head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.icon {
  font-size: 24px;
  width: 30px;
  text-align: center;
}

.title {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.desc {
  margin-top: 2px;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.chip.trait.perk {
  color: var(--good);
}

.chip.trait.drawback {
  color: var(--warn);
}

.foot {
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
</style>
