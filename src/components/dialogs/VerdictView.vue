<template>
  <div class="verdict">
    <div class="readout">
      <VerdictDial v-for="d in shownDials" :key="d.key" :dial="d" />
      <div class="lines">
        <p v-if="verdict.rejected" class="bad">{{ verdict.rejected }} Reword it, or try another angle.</p>
        <p v-else-if="verdict.duplicateOf" class="ai">Jev thinks that’s the same as {{ verdict.duplicateOf }}.</p>
        <template v-else>
          <p v-if="riskLine" class="risk">⚠ {{ riskLine }}</p>
          <p v-if="verdict.repeatOf" class="warn">↻ Jev thinks you’ve done this before ({{ verdict.repeatOf }}), so it’s one step less effective.</p>
        </template>
      </div>
    </div>

    <template v-if="!verdict.rejected && !verdict.duplicateOf">
      <fieldset v-for="t in verdict.torn" :key="t.key" class="torn">
        <legend>Jev is torn on {{ t.topic }}</legend>
        <label v-for="(o, i) in t.options" :key="o.value" class="choice">
          <input
            type="radio"
            :name="`torn-${t.key}`"
            :value="o.value"
            :checked="(verdict.picks[t.key] ?? t.options[0]!.value) === o.value"
            @change="emit('pick', t.key, o.value)"
          />
          <span>
            <strong>{{ o.label }}</strong>
            <template v-if="t.catch && i === 0"><span class="muted">: exactly what you proposed</span></template>
            <template v-else-if="t.catch">
              <span class="muted">, but </span>
              <span class="warn" :title="complicationName(t.catch).rule">
                {{ complicationName(t.catch).icon }} {{ complicationName(t.catch).name }}
              </span>
              <span class="muted small">({{ lower(complicationName(t.catch).rule) }})</span>
            </template>
          </span>
        </label>
      </fieldset>

      <slot />
    </template>

    <div class="actions">
      <button type="button" @click="emit('edit')">← Edit</button>
      <button
        v-if="saveLabel"
        type="button"
        class="primary"
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || game.busy"
        title="Banks every option to the Research tab, for one action"
        @click="emit('save')"
      >
        {{ saveLabel }}
      </button>
      <button
        v-else-if="acceptLabel"
        type="button"
        class="primary"
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || game.busy"
        @click="emit('accept')"
      >
        {{ acceptLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { complicationName } from '@/engine/proposals'
import { RISK_BONUS, riskText } from '@/engine/risk'
import { useGameStore, type Verdict } from '@/stores/game'
import VerdictDial, { type Dial } from '../kit/VerdictDial.vue'
import { plausibleDial } from './dials'

/** `dials`: more of Jev's answers to show beside plausibility (see dials.ts), hidden on a rejection. */
const props = defineProps<{ verdict: Verdict; acceptLabel?: string | null; saveLabel?: string; dials?: Dial[] }>()
const emit = defineEmits<{
  pick: [key: string, value: string]
  accept: []
  save: []
  edit: []
}>()
const game = useGameStore()

const shownDials = computed(() => {
  const v = props.verdict
  return [plausibleDial(v), ...(v.rejected || v.duplicateOf ? [] : (props.dials ?? []))]
})

const riskLine = computed(() => {
  const v = props.verdict
  return v.risk && v.kind in RISK_BONUS ? riskText(v.risk, v.kind as keyof typeof RISK_BONUS) : ''
})
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '')
</script>

<style scoped>
.verdict {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.verdict p {
  margin: 0;
}

.readout {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 0 0 20px rgb(0 0 0 / 0.6);
}

.lines {
  min-width: 180px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--lcd-fg);
}

.risk {
  color: var(--led-r);
}

.torn {
  margin: 0;
  padding: 6px 12px 8px;
  border: 1px solid var(--led-b);
  background: rgb(115 208 255 / 0.05);
}

.torn legend {
  padding: 0 6px;
  font-family: var(--font-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
  color: var(--led-b);
}

.choice {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  padding: 2px 0;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--chrome-3);
}

</style>
