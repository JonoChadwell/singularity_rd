<template>
  <div ref="el" class="storage-box" role="dialog" :aria-label="`Storage for ${r.name}`" @click.stop @mouseenter.stop>
    <header class="head">
      <span class="silk">Storage · {{ r.icon }} {{ r.name }}</span>
      <button type="button" class="small close" aria-label="Close storage" @click="ui.toggleStorage(null)">✕</button>
    </header>
    <p class="sum num">
      {{ fmt(r.cap) }} to start<template v-if="depots.length"> + {{ fmt(Math.max(0, cap - r.cap)) }} in depots</template> = {{ fmt(cap) }}
      · Maximum Storage Limit: {{ ceilingLabel(r.ceiling) }}
    </p>
    <DepotRow v-for="d in depots" :key="d.id" :depot="d" />
    <p v-if="!depots.length" class="note">
      No depots yet. Design one, a place that suits {{ r.name }}; then build as many as you need here, at no action.
    </p>
    <footer>
      <button type="button" class="small" @click="ui.openInvent({ kind: 'storage', resourceId: r.id })">+ Design depot</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ceilingLabel } from '@/engine/ceilings'
import { capOf, depotsFor, fmt } from '@/engine/model'
import type { Resource } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DepotRow from './DepotRow.vue'

// A resource's storage, opened from Storage on its bus plate: its depots, built here at no
// action, and the way to design another. Depots aren't units, so they don't get chips.

const props = defineProps<{ r: Resource }>()
const game = useGameStore()
const ui = useUiStore()
const el = ref<HTMLElement>()
const depots = computed(() => depotsFor(game.state, props.r.id))
const cap = computed(() => capOf(game.state, props.r))

/** Closes on Escape, or a click outside (other than the button that toggles it, or a dialog it opened). */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !ui.invent) ui.toggleStorage(null)
}
function onDown(e: PointerEvent) {
  const t = e.target as Element | null
  if (!t || el.value?.contains(t) || t.closest('[data-storage-toggle], dialog, .drawer')) return
  ui.toggleStorage(null)
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onDown)
})
</script>

<style scoped>
.storage-box {
  position: absolute;
  left: calc(100% + 10px);
  top: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 320px;
  padding: 6px 8px 8px;
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-hi), 0 8px 24px rgb(0 0 0 / 0.5);
  cursor: default;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.close {
  padding: 0 5px;
}

.sum,
.note {
  margin: 0;
  font-size: 11px;
  color: var(--silk-dim);
}

footer {
  display: flex;
}
</style>
