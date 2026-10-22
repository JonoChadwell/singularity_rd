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
            :title="`${mind.hardware.name} hardware, IQ ${mind.hardware.iq}, running ${softwareLabel(mind)}. Software upgrades can raise it to ${Math.round(ceilingIQ(mind))}; past that needs new hardware.`"
          >
            IQ {{ Math.round(currentIQ(mind)) }}<span class="muted"> / {{ Math.round(ceilingIQ(mind)) }}</span>
          </span>
        </div>
        <div class="muted small desc">{{ mind.description }}</div>
      </div>
    </header>

    <div class="facts small muted">
      <span>🔩 {{ mind.hardware.name }} · 💾 {{ softwareLabel(mind) }}</span>
      <span v-if="!mind.starting">· Jev: {{ Math.round(mind.plausibility * 100) }}% plausible</span>
    </div>

    <footer class="row foot">
      <button class="link" @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: mind.id } })">
        Upgrade
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { ceilingIQ, currentIQ, softwareLabel } from '@/engine/model'
import type { Mind } from '@/engine/types'
import { useUiStore } from '@/stores/ui'

defineProps<{ mind: Mind }>()
const ui = useUiStore()
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

.foot {
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
</style>
