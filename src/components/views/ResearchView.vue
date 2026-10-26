<template>
  <div class="research">
    <div class="toolbar">
      <h2>Work orders</h2>
      <span class="lbl">Doing research is instant. Proposing it takes the week.</span>
      <span class="buttons">
        <button class="small" :disabled="!!lockReason(game.state, 'create')" @click="ui.openInvent({ kind: 'create' })">+ Create</button>
        <button v-if="!coverLock" class="small" @click="ui.openInvent({ kind: 'cover' })">+ Cover</button>
      </span>
    </div>

    <p v-if="!game.state.research.length" class="empty silk">
      No work orders. Research comes only from your ideas: a unit or a platform to design, sourcing or storage, an advanced strategy, or an
      upgrade to something you own.
    </p>

    <div class="orders">
      <template v-for="e in entries" :key="e.key">
        <section v-if="e.items.length > 1" class="tray">
          <header class="tray-head">
            <span class="silk">Pick one of {{ e.items.length }}</span>
            <span class="lbl">Researching one drops the others</span>
          </header>
          <div class="tray-items">
            <WorkOrder v-for="r in e.items" :key="r.id" :r="r" />
          </div>
        </section>
        <WorkOrder v-else :r="e.items[0]!" />
      </template>
    </div>

    <section v-if="game.state.deliveries.length" class="deliveries">
      <h2>Pending deliveries</h2>
      <table>
        <tbody>
          <tr v-for="(d, i) in game.state.deliveries" :key="i">
            <td>{{ d.name }}</td>
            <td class="num">{{ describeDelivery(game.state, d) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { describeDelivery } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import type { Research } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import WorkOrder from './WorkOrder.vue'

const game = useGameStore()
const ui = useUiStore()
const coverLock = computed(() => lockReason(game.state, 'cover'))

/** The goal first, then the rest, with options saved together from one idea gathered into a tray. */
const entries = computed(() => {
  const ordered = [...game.state.research].sort((a, b) => Number(b.effect.kind === 'goal') - Number(a.effect.kind === 'goal'))
  const out: { key: string; items: Research[] }[] = []
  for (const r of ordered) {
    const set = r.group ? out.find((e) => e.key === r.group) : undefined
    if (set) set.items.push(r)
    else out.push({ key: r.group ?? r.id, items: [r] })
  }
  return out
})
</script>

<style scoped>
.research {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.buttons {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.orders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  align-items: start;
}

.tray {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 2px dashed var(--chrome-4);
  background: rgb(0 0 0 / 0.15);
}

.tray-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.tray-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.deliveries table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.deliveries td {
  padding: 3px 0;
  border-top: 1px solid var(--chrome-3);
}

.deliveries h2 {
  margin-bottom: 6px;
}
</style>
