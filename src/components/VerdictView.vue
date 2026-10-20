<template>
  <div class="verdict">
    <div class="odds">
      <div class="row">
        <strong>Jev</strong>
        <span class="num" :class="verdict.plausibility >= verdict.bar ? 'good' : 'bad'">
          {{ pct(verdict.plausibility) }} plausible
        </span>
        <span class="muted small">· bar {{ pct(verdict.bar) }}</span>
      </div>
      <div class="meter bar-meter">
        <div :style="{ width: pct(verdict.plausibility), background: verdict.plausibility >= verdict.bar ? 'var(--accent)' : 'var(--bad)' }" />
        <span class="mark" :style="{ left: pct(verdict.bar) }" />
      </div>
    </div>

    <p v-if="verdict.rejected" class="bad">✋ Rejected: {{ verdict.rejected }} Reword it, or try another angle.</p>
    <p v-else-if="verdict.duplicateOf" class="ai">🔁 Jev thinks that’s the same as {{ verdict.duplicateOf }}.</p>
    <template v-else>
      <fieldset v-for="t in verdict.torn" :key="t.key" class="torn">
        <legend class="small">Jev is torn on {{ t.topic }}.</legend>
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

      <div v-if="verdict.kind === 'unit'" class="traits small">
        <div class="row">
          <span class="muted">Traits:</span>
          <TraitChips v-if="keptList.length" :traits="keptList" />
          <span v-else class="muted">none</span>
        </div>
        <div v-if="optional.length" class="row">
          <span class="muted" title="Jev wasn’t sure. Perks raise the price; drawbacks lower it.">Your call:</span>
          <label v-for="t in optional" :key="t.trait" class="choice" :title="TRAITS[t.trait].rule">
            <input
              type="checkbox"
              :checked="kept.has(t.trait)"
              :disabled="!kept.has(t.trait) && kept.size >= MAX_TRAITS"
              @change="emit('trait', t.trait, !kept.has(t.trait))"
            />
            {{ TRAITS[t.trait].icon }} {{ TRAITS[t.trait].name }}
          </label>
        </div>
      </div>

      <div v-if="missing.length" class="pushback">
        <p class="warn small">
          Jev pushes back: building one needs more. For each missing kind of part, add something you have, or name
          something new.
        </p>
        <div v-for="(kind, i) in missing" :key="kind" class="reply">
          <div class="small"><strong>Missing {{ kind }}</strong></div>
          <div class="row">
            <select v-model="replies[i]!.resourceId" class="inline" :aria-label="`Something for ${kind}`">
              <option value="">New resource…</option>
              <option v-for="r in game.state.resources" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
            </select>
            <template v-if="!replies[i]!.resourceId">
              <input v-model="replies[i]!.newName" class="grow" :placeholder="PLACEHOLDERS[kind]" :maxlength="NAME_MAX" />
            </template>
          </div>
        </div>
        <p v-for="f in failures" :key="f" class="bad small">{{ f }}</p>
        <button class="small" :disabled="!canAnswer" @click="answer">
          {{ game.busy ? 'Jev is checking…' : 'Answer Jev' }}
        </button>
      </div>

      <slot />
    </template>

    <div class="actions">
      <button type="button" @click="emit('edit')">← Edit</button>
      <button
        type="button"
        class="primary"
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || missing.length > 0 || game.busy"
        @click="emit('accept')"
      >
        {{ acceptLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_TRAITS, type PartKind } from '@/engine/balance'
import { complicationName, NAME_MAX } from '@/engine/proposals'
import TraitChips from './TraitChips.vue'
import { TRAITS } from '@/engine/traits'
import { chosenTraits, nearLine, type PushbackReply } from '@/engine/unitProposal'
import { useGameStore, type Verdict } from '@/stores/game'

const props = defineProps<{ verdict: Verdict; acceptLabel: string }>()
const emit = defineEmits<{
  pick: [key: string, value: string]
  trait: [trait: keyof typeof TRAITS, on: boolean]
  replace: [verdict: Verdict]
  accept: []
  edit: []
}>()
const game = useGameStore()

const PLACEHOLDERS: Record<PartKind, string> = {
  'an advanced component': 'e.g. Quantum Processors',
  'an exotic material': 'e.g. Graphene Sheets',
  'a special power source': 'e.g. Superconducting Power Cables',
  'precision machinery': 'e.g. EUV Lithography Tools',
  'a specialized facility': 'e.g. Clean Room',
  'bulk raw materials': 'e.g. Silicon',
  'skilled operators': 'e.g. Trained Technicians',
  'biological material': 'e.g. Stem Cells',
  'data or knowledge': 'e.g. Training Data',
  'cooling or containment': 'e.g. Liquid Helium',
  'transport or logistics': 'e.g. Freight Contracts'
}

const pct = (p: number) => `${Math.round(p * 100)}%`
const missing = computed(() => ('missing' in props.verdict ? props.verdict.missing : []))
const keptList = computed(() => (props.verdict.kind === 'unit' ? chosenTraits(props.verdict).map((t) => t.trait) : []))
const kept = computed(() => new Set<string>(keptList.value))
/** Traits near the line that the player decides. A few at most, so the list stays readable. */
const optional = computed(() => (props.verdict.kind === 'unit' ? props.verdict.traitOdds.filter(nearLine).slice(0, 4) : []))
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '')

const replies = ref<PushbackReply[]>([])
const failures = ref<string[]>([])
watch(
  missing,
  (kinds) => {
    replies.value = kinds.map((kind) => ({ kind, resourceId: '', newName: '' }))
  },
  { immediate: true }
)
const canAnswer = computed(
  () =>
    game.canPropose &&
    replies.value.length > 0 &&
    replies.value.every((r) => r.resourceId || (r.newName?.trim().length ?? 0) >= 2)
)

async function answer() {
  const v = props.verdict
  if (v.kind !== 'unit') return
  const cleaned = replies.value.map((r) => (r.resourceId ? { kind: r.kind, resourceId: r.resourceId } : { kind: r.kind, newName: r.newName }))
  const result = await game.pushback(v, cleaned)
  if (!result) {
    failures.value = game.lastError ? [game.lastError] : []
    return
  }
  failures.value = result.failures
  emit('replace', result.verdict)
}
</script>

<style scoped>
.verdict {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.verdict p {
  margin: 0;
}

.bar-meter {
  position: relative;
  margin-top: 4px;
  overflow: visible;
}

.mark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--text);
}

.torn {
  border: 1px solid rgb(167 139 250 / 0.4);
  border-radius: 6px;
  padding: 6px 10px 8px;
  margin: 0;
}

.choice {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  padding: 2px 0;
}

.choice input {
  width: auto;
}

.traits {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pushback {
  border: 1px solid rgb(251 191 36 / 0.4);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reply .row {
  flex-wrap: nowrap;
  margin-top: 2px;
}

.grow {
  flex: 1;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
</style>
