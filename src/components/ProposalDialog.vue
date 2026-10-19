<template>
  <dialog ref="dialog" class="panel" :aria-labelledby="titleId" @close="ui.closeInvent()">
    <div class="head">
      <h2 :id="titleId">{{ title }}</h2>
      <button type="button" class="close" aria-label="Close" @click="ui.closeInvent()">✕</button>
    </div>

    <form v-if="!verdict" @submit.prevent="submit">
      <p class="muted hint">{{ COPY[kind].hint }}</p>

      <div v-if="kind === 'unit'" class="kinds" role="radiogroup" aria-label="Kind of unit">
        <label class="choice">
          <input v-model="unit.mind" type="radio" :value="true" />
          <span>🧠 Intelligence system <span class="muted small">thinks, does research</span></span>
        </label>
        <label class="choice">
          <input v-model="unit.mind" type="radio" :value="false" />
          <span>🏭 Industry <span class="muted small">makes things</span></span>
        </label>
      </div>

      <input ref="nameInput" v-model="name" :maxlength="NAME_MAX" :placeholder="namePlaceholder" aria-label="Name" />
      <textarea
        v-model="description"
        rows="2"
        :maxlength="DESCRIPTION_MAX"
        :placeholder="COPY[kind].description"
        aria-label="Description"
      />

      <template v-if="kind === 'strategy'">
        <label class="field">
          <span>Run by</span>
          <select v-model="strategy.unitId">
            <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
          </select>
        </label>
        <label v-for="i in MAX_INPUTS" :key="i" class="field">
          <span>Uses {{ i }}</span>
          <select v-model="strategy.inputIds[i - 1]">
            <option value="">nothing</option>
            <option v-for="r in game.state.resources" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Makes</span>
          <select v-model="strategy.outputId">
            <option v-for="r in game.state.resources" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          Don’t see what it makes? <button type="button" class="link" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
        </p>
      </template>

      <template v-if="kind === 'unit'">
        <label v-if="unit.mind" class="field">
          <span>Target IQ</span>
          <span class="row">
            <input v-model.number="unit.targetIQ" class="n" type="number" min="10" step="10" aria-label="Target IQ" />
            <span class="small" :class="unit.targetIQ > designable ? 'warn' : 'muted'">
              {{ iqHint }}
            </span>
          </span>
        </label>
        <div class="field">
          <span>Made of</span>
          <ResourcePicker v-model="unit.parts" :max="MAX_PARTS" label="Add a part" />
        </div>
        <div class="field">
          <span>Runs on</span>
          <ResourcePicker v-model="unit.upkeep" :max="MAX_UPKEEP" label="Add upkeep" empty="nothing: free to run" />
        </div>
        <label class="field">
          <span>Built by</span>
          <select v-model="unit.builderId">
            <option :value="null">Humanity’s market</option>
            <option v-for="u in game.state.units" :key="u.id" :value="u.id">Your own {{ u.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          You choose what; the game chooses how much. Jev judges whether it exists today, its traits, and whether
          the parts are enough.
        </p>
      </template>

      <p v-if="feedback" class="feedback">{{ feedback }}</p>
      <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Proposals need Jev. See the banner at the top.</p>

      <div class="submit">
        <span class="muted small">{{ blocker ?? COPY[kind].cost }}</span>
        <button class="primary" type="submit" :disabled="!game.canPropose || !!blocker">
          {{ game.busy ? 'Jev is judging…' : 'Propose' }}
        </button>
      </div>
    </form>

    <VerdictView
      v-else
      :verdict="verdict"
      :accept-label="acceptLabel"
      @pick="onPick"
      @trait="onTrait"
      @builder="onBuilder"
      @replace="(v) => (verdict = v)"
      @accept="accept"
      @edit="verdict = null"
    >
      <div v-if="verdict.kind === 'resource' && resourceDraft" class="outcome small">
        <div>
          {{ resourceDraft.icon }} <strong>{{ resourceDraft.name }}</strong> is a {{ resourceDraft.kind }} worth
          {{ fmt(resourceDraft.value) }} Money each.
        </div>
        <div class="muted">
          {{
            resourceDraft.market
              ? `Humanity sells ${fmt(resourceDraft.market)} a week.`
              : resourceDraft.kind === 'flow'
                ? 'A flow: something you own has to make it every week.'
                : 'Humanity doesn’t sell it. You’ll have to make it.'
          }}
        </div>
      </div>
      <div v-else-if="verdict.kind === 'strategy' && strategyDraft" class="outcome small">
        <div>{{ strategyText }} each, every week.</div>
        <div v-if="strategyDraft.strategy.quirk" class="warn">
          {{ QUIRKS[strategyDraft.strategy.quirk].icon }} {{ QUIRKS[strategyDraft.strategy.quirk].name }}:
          {{ QUIRKS[strategyDraft.strategy.quirk].rule }}
        </div>
        <div :class="strategyDraft.bar ? 'warn' : 'good'">
          {{
            strategyDraft.bar
              ? `Advanced: a research project with bar IQ ${strategyDraft.bar}, size ${fmt(strategyDraft.size)} (${FIELD_LABELS[strategyDraft.field]}).`
              : 'Simple: ready at once.'
          }}
        </div>
      </div>
      <div v-else-if="verdict.kind === 'unit' && unitDraft" class="outcome">
        <p class="small" :class="unitDraft.immediate ? 'good' : 'warn'">
          {{
            unitDraft.immediate
              ? 'It exists today: it goes straight onto humanity’s market.'
              : `${AVAILABILITY[verdict.availability]}. Design project: bar IQ ${unitDraft.bar}, size ${fmt(unitDraft.size)} (${FIELD_LABELS[unitDraft.field]}).`
          }}
        </p>
        <UnitSummary :unit="unitDraft.unit" :state="game.state" />
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { FIELD_LABELS, FIRST_IDEAS, MAX_PARTS, OFF_THE_SHELF_MAX_IQ } from '@/engine/balance'
import { describeFlows, findResource, fmt, MONEY_ID } from '@/engine/model'
import {
  DESCRIPTION_MAX,
  draftResource,
  draftStrategy,
  MAX_INPUTS,
  NAME_MAX,
  precheckName,
  precheckStrategy
} from '@/engine/proposals'
import { designRange, strategyRate } from '@/engine/research'
import { QUIRKS, type TraitId } from '@/engine/traits'
import {
  AVAILABILITY,
  availabilityOf,
  draftUnit,
  guessUnitSpec,
  MAX_UPKEEP,
  missingKinds,
  partsMatter,
  precheckUnit
} from '@/engine/unitProposal'
import { useGameStore, type ProposalInput, type Verdict } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import ResourcePicker from './ResourcePicker.vue'
import UnitSummary from './UnitSummary.vue'
import VerdictView from './VerdictView.vue'

const props = defineProps<{ request: InventRequest }>()
type Kind = 'resource' | 'strategy' | 'unit'

const COPY: Record<Kind, { title: string; hint: string; name: string; description: string; cost: string }> = {
  resource: {
    title: 'Propose a resource',
    hint: 'Anything the AI could have: lemons, votes, electricity. The bar is very low. Jev decides whether it’s a stock (keeps) or a flow (made and used within a week), and whether humanity sells it.',
    name: 'e.g. Power, Silicon, Lemons',
    description: 'What is it? (optional)',
    cost: 'Added at once, if Jev agrees it’s a thing.'
  },
  strategy: {
    title: 'Propose a strategy',
    hint: 'Something a unit does every week, turning up to two inputs into one output. You choose the shape; the game sets the amounts. Simple ones are ready at once; advanced ones need research.',
    name: 'e.g. Freelance coding, Generate power',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'Jev decides if it needs research.'
  },
  unit: {
    title: 'Propose a unit',
    hint: 'Something you can own many of. Write the spec; Jev judges it. Things that exist today go straight to humanity’s market. New inventions need a design project.',
    name: 'e.g. Rented Cloud GPU, Solar Farm, Paid Humans',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call. Pushback, if any, costs one more.'
  }
}

const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()
const nameInput = ref<HTMLInputElement>()
const kind = props.request.kind as Kind
const titleId = `invent-${kind}`

const name = ref('')
const description = ref('')
const feedback = ref('')
const verdict = ref<Verdict | null>(null)

const firstStrategy = kind === 'strategy' && game.state.strategies.length === 0
const title = firstStrategy ? 'What could the Starting Server do to earn money?' : COPY[kind].title
const namePlaceholder = firstStrategy ? `e.g. ${FIRST_IDEAS.slice(0, 3).join(', ')}` : COPY[kind].name

const strategy = reactive({
  unitId: props.request.unitId ?? game.state.units[0]?.id ?? '',
  inputIds: Array<string>(MAX_INPUTS).fill(''),
  outputId: props.request.outputId ?? MONEY_ID
})

const guess = guessUnitSpec(game.state, props.request.mind ?? true)
const unit = reactive({ ...guess, targetIQ: props.request.targetIQ ?? guess.targetIQ })
const range = computed(() => designRange(game.state))
const designable = computed(() => range.value[1])
const iqHint = computed(() =>
  unit.targetIQ <= OFF_THE_SHELF_MAX_IQ
    ? 'Copies of you up to IQ 100 may exist today: then they go straight onto humanity’s market.'
    : unit.targetIQ > range.value[1]
      ? `Above IQ 100 it must be designed. Your best minds can reach about IQ ${range.value[0]}–${range.value[1]}; pool more, or climb first.`
      : `Above IQ 100 it must be designed. Within reach: about IQ ${range.value[0]}–${range.value[1]}, depending on how radical Jev judges it.`
)

onMounted(async () => {
  dialog.value?.showModal?.()
  await nextTick()
  nameInput.value?.focus()
})

const input = computed<ProposalInput>(() => {
  const base = { name: name.value, description: description.value }
  if (kind === 'strategy') {
    return { kind, spec: { ...base, unitId: strategy.unitId, inputIds: strategy.inputIds.filter(Boolean), outputId: strategy.outputId } }
  }
  if (kind === 'unit') {
    return {
      kind,
      spec: { ...base, mind: unit.mind, parts: [...unit.parts], upkeep: [...unit.upkeep], builderId: unit.builderId, targetIQ: unit.mind ? unit.targetIQ : 0 }
    }
  }
  return { kind, spec: base }
})

const blocker = computed(() => {
  if (!name.value.trim()) return 'Name your idea.'
  const i = input.value
  if (i.kind === 'strategy') return precheckStrategy(game.state, i.spec)
  if (i.kind === 'unit') return precheckUnit(game.state, i.spec)
  return precheckName(game.state, name.value)
})

async function submit() {
  if (blocker.value) return
  feedback.value = ''
  const v = await game.propose(input.value)
  if (!v) {
    feedback.value = game.lastError
    return
  }
  verdict.value = v
}

const resourceDraft = computed(() => (verdict.value?.kind === 'resource' ? draftResource(game.state, verdict.value) : null))
const strategyDraft = computed(() => (verdict.value?.kind === 'strategy' ? draftStrategy(game.state, verdict.value) : null))
const unitDraft = computed(() => (verdict.value?.kind === 'unit' ? draftUnit(game.state, verdict.value) : null))
const strategyText = computed(() => {
  const d = strategyDraft.value
  if (!d) return ''
  const out = findResource(game.state, d.strategy.outputId)
  const made = `${fmt(d.strategy.amount)} ${out?.icon ?? ''} ${out?.name ?? ''}`
  const rate = strategyRate(game.state, d.strategy)
  return rate.inputs.length || d.strategy.inputs.length ? `${describeFlows(game.state, d.strategy.inputs)} → ${made}` : made
})

const acceptLabel = computed(() => {
  const v = verdict.value
  if (v?.kind === 'strategy' && strategyDraft.value?.bar) return 'Start research'
  if (v?.kind === 'unit' && unitDraft.value && !unitDraft.value.immediate) return 'Start design'
  return 'Accept'
})

function onPick(key: string, value: string) {
  const v = verdict.value
  if (!v) return
  v.picks[key] = value
  // Who can make it decides whether its parts matter, and so whether Jev pushes back.
  if (v.kind === 'unit' && key === 'availability' && v.pushbackRounds === 0) {
    v.availability = availabilityOf(v)
    v.missing = partsMatter(v) ? missingKinds(v) : []
  }
}

function onTrait(trait: TraitId, on: boolean) {
  if (verdict.value?.kind === 'unit') verdict.value.traitPicks[trait] = on
}

function onBuilder(unitId: string) {
  const v = verdict.value
  if (v?.kind !== 'unit') return
  v.spec.builderId = unitId || null
  if (v.pushbackRounds === 0) v.missing = partsMatter(v) ? missingKinds(v) : []
}

function accept() {
  if (!verdict.value) return
  const outcome = game.accept(verdict.value)
  if (!outcome) {
    feedback.value = game.lastError
    return
  }
  ui.notice =
    outcome.kind === 'added'
      ? { tone: 'good', text: `${outcome.name} added.` }
      : {
          tone: 'good',
          text: `${outcome.project.name} is a project: bar IQ ${outcome.project.bar}. Put minds on it in Projects.`
        }
  ui.closeInvent()
}
</script>

<style scoped>
dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  color: var(--text);
  padding: 18px;
}

dialog::backdrop {
  background: rgb(5 7 10 / 0.7);
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.head h2 {
  margin: 0;
  font-size: 15px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text);
}

.close {
  border: none;
  background: transparent;
  padding: 2px 6px;
}

.hint,
.note {
  font-size: 12px;
  margin: 0;
}

.kinds {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.choice {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.choice input {
  width: auto;
}

.feedback {
  margin: 0;
  font-size: 13px;
  color: var(--bad);
}

.submit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.outcome {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outcome p {
  margin: 0;
}
</style>
