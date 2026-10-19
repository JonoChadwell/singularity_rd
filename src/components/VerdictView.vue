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
        <legend class="small">Jev is torn: <span class="muted">{{ t.question }}</span></legend>
        <label v-for="o in t.options" :key="o.value" class="choice">
          <input
            type="radio"
            :name="`torn-${t.key}`"
            :value="o.value"
            :checked="(verdict.picks[t.key] ?? t.options[0]!.value) === o.value"
            @change="emit('pick', t.key, o.value)"
          />
          <span>{{ o.label }}</span>
          <span class="muted small num">{{ pct(o.p) }}</span>
        </label>
      </fieldset>

      <div v-if="verdict.kind === 'unit' && verdict.traitOdds.length" class="traits">
        <div class="small muted">Traits (up to {{ MAX_TRAITS }}). Perks raise the price; drawbacks lower it.</div>
        <label
          v-for="t in verdict.traitOdds"
          :key="t.trait"
          class="choice trait"
          :title="TRAITS[t.trait].rule"
        >
          <input
            type="checkbox"
            :checked="kept.has(t.trait)"
            :disabled="!nearLine(t) || (!kept.has(t.trait) && kept.size >= MAX_TRAITS)"
            @change="emit('trait', t.trait, !kept.has(t.trait))"
          />
          <span>{{ TRAITS[t.trait].icon }} {{ TRAITS[t.trait].name }}</span>
          <span class="muted small">{{ TRAITS[t.trait].kind }} · {{ pct(t.p) }}{{ nearLine(t) ? ' · your call' : '' }}</span>
        </label>
      </div>

      <label v-if="verdict.kind === 'unit' && needsBuilder(verdict)" class="field builder">
        <span class="warn">Who builds it?</span>
        <select :value="verdict.spec.builderId ?? ''" @change="emit('builder', ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Humanity can’t make these: choose a builder</option>
          <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
        </select>
      </label>

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
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || missing.length > 0 || builderMissing || game.busy"
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
import { NAME_MAX } from '@/engine/proposals'
import { TRAITS } from '@/engine/traits'
import { chosenTraits, nearLine, needsBuilder, type PushbackReply } from '@/engine/unitProposal'
import { useGameStore, type Verdict } from '@/stores/game'

const props = defineProps<{ verdict: Verdict; acceptLabel: string }>()
const emit = defineEmits<{
  pick: [key: string, value: string]
  trait: [trait: keyof typeof TRAITS, on: boolean]
  builder: [unitId: string]
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
const kept = computed(() =>
  props.verdict.kind === 'unit' ? new Set(chosenTraits(props.verdict).map((t) => t.trait)) : new Set<string>()
)
const builderMissing = computed(() => props.verdict.kind === 'unit' && needsBuilder(props.verdict))

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
  if (v.kind !== 'unit' && v.kind !== 'breakthrough') return
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
