<template>
  <dialog ref="dialog" class="panel" :aria-labelledby="titleId" @close="ui.closeInvent()">
    <div class="head">
      <div class="title">
        <HelpTip :text="COPY[kind].help" />
        <h2 :id="titleId">{{ COPY[kind].title }}</h2>
      </div>
      <button type="button" class="close" aria-label="Close" @click="ui.closeInvent()">✕</button>
    </div>

    <form v-if="!verdict" @submit.prevent="submit">
      <PresetList :items="presetItems" :label="COPY[kind].presets" :selected="presetName" @pick="applyPreset" />
      <p v-if="missingResources.length" class="small warn note">
        Not in the game yet:
        <template v-for="(r, i) in missingResources" :key="r">
          <button type="button" class="link" @click="introduce(r)">+ {{ r }}</button
          >{{ i < missingResources.length - 1 ? ', ' : '.' }}
        </template>
        Introduce {{ missingResources.length === 1 ? 'it' : 'them' }}, and this form comes back.
      </p>

      <input ref="nameInput" v-model="name" :maxlength="NAME_MAX" :placeholder="COPY[kind].name" aria-label="Name" />
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

      <template v-if="kind === 'income'">
        <p v-if="!stocks.length" class="small warn note">
          Propose a resource first: something it could yield, like Money.
          <button type="button" class="link" @click="introduce('Money')">+ Money</button>
        </p>
        <label v-else class="field">
          <span>Yields</span>
          <select v-model="income.outputId">
            <option v-for="r in stocks" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          Don’t see what it yields? <button type="button" class="link" @click="introduce('')">+ Resource</button>
        </p>
      </template>

      <template v-if="kind === 'mind'">
        <label class="field">
          <span>Hardware</span>
          <input
            v-model="mind.hardware"
            :maxlength="NAME_MAX"
            :placeholder="name.trim() || 'The platform it runs on'"
            aria-label="Hardware"
          />
        </label>
        <label class="field">
          <span>Hardware IQ</span>
          <span class="row">
            <input v-model.number="mind.iq" class="n" type="number" min="10" step="10" aria-label="Hardware IQ" />
            <span class="small" :class="mind.iq > range[1] ? 'warn' : 'muted'">{{ iqHint }}</span>
          </span>
        </label>
        <label class="field">
          <span>Software</span>
          <span class="row">
            <input v-model="mind.software" :maxlength="NAME_MAX" :placeholder="DEFAULT_SOFTWARE" aria-label="Software" />
            <span class="small muted">{{ softwareVersion(0) }}; upgrades can raise IQ to ×{{ IQ_CEILING }}</span>
          </span>
        </label>
      </template>

      <template v-if="kind === 'unit'">
        <div class="field">
          <span>Made from</span>
          <ResourcePicker v-model="unit.parts" :max="MAX_PARTS" label="Add a part" />
        </div>
        <div class="field">
          <span>Runs on</span>
          <ResourcePicker v-model="unit.upkeep" :max="MAX_UPKEEP" label="Add upkeep" empty="nothing: free to run" />
        </div>
        <label v-if="game.state.units.length" class="field">
          <span>Also built by</span>
          <select v-model="unit.builderId">
            <option :value="null">Nobody: you create them from parts</option>
            <option v-for="u in game.state.units" :key="u.id" :value="u.id">Your own {{ u.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          You create them from their parts, as many as you can afford. You choose what; the game chooses how much. Jev
          judges how hard it is to design, its traits, and whether the parts are enough.
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
      @replace="(v) => (verdict = v)"
      @accept="accept"
      @edit="verdict = null"
    >
      <div v-if="verdict.kind === 'resource' && resourceDraft" class="outcome small">
        <div class="muted">
          {{
            resourceDraft.kind === 'flow'
              ? 'A flow: something you own has to make it every week.'
              : 'A stock: it keeps from week to week. You’ll have to make it, or earn it.'
          }}
        </div>
      </div>
      <div v-else-if="verdict.kind === 'strategy' && strategyDraft" class="outcome small">
        <div>{{ strategyText }} each, every week.</div>
        <div v-if="strategyDraft.strategy.quirk" class="warn">
          {{ QUIRKS[strategyDraft.strategy.quirk].icon }} {{ QUIRKS[strategyDraft.strategy.quirk].name }}:
          {{ QUIRKS[strategyDraft.strategy.quirk].rule }}
        </div>
        <div :class="strategyDraft.minIQ ? 'warn' : 'good'">
          {{ strategyDraft.minIQ ? `Advanced. ${researchText(strategyDraft)}` : 'Simple: ready at once.' }}
        </div>
      </div>
      <div v-else-if="verdict.kind === 'unit' && unitDraft" class="outcome">
        <p class="small warn">{{ researchText(unitDraft) }}</p>
        <UnitSummary :unit="unitDraft.unit" :state="game.state" />
      </div>
      <div v-else-if="verdict.kind === 'income' && incomeDraft" class="outcome small">
        <div>💸 +{{ describeFlows(game.state, [incomeDraft.income]) }} every week, once researched.</div>
        <div class="warn">{{ researchText(incomeDraft) }}</div>
      </div>
      <div v-else-if="verdict.kind === 'mind' && mindDraft" class="outcome small">
        <div>
          {{ mindDraft.mind.icon }} <strong>{{ mindDraft.mind.name }}</strong>: {{ mindDraft.mind.hardware.name }}
          hardware, IQ {{ mindDraft.mind.hardware.iq }}, running {{ mindDraft.mind.software.name }}.
        </div>
        <div class="warn">{{ researchText(mindDraft) }}</div>
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { IQ_CEILING, MAX_PARTS } from '@/engine/balance'
import { DEFAULT_SOFTWARE, draftMind, guessIQ, precheckMind } from '@/engine/mindProposal'
import { draftIncome, precheckIncome } from '@/engine/incomeProposal'
import { bestIQ, describeCost, describeFlows, designRange, findResource, fmt, softwareVersion } from '@/engine/model'
import {
  INCOME_PRESETS,
  MIND_PRESETS,
  resolveResources,
  RESOURCE_PRESETS,
  runnerFor,
  STRATEGY_PRESETS,
  taken,
  UNIT_PRESETS
} from '@/engine/presets'
import {
  DESCRIPTION_MAX,
  draftResource,
  draftStrategy,
  MAX_INPUTS,
  NAME_MAX,
  precheckName,
  precheckStrategy
} from '@/engine/proposals'
import { QUIRKS, type TraitId } from '@/engine/traits'
import {
  draftUnit,
  guessUnitSpec,
  MAX_UPKEEP,
  precheckUnit
} from '@/engine/unitProposal'
import { useGameStore, type ProposalInput, type Verdict } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import HelpTip from './HelpTip.vue'
import PresetList, { type PresetItem } from './PresetList.vue'
import ResourcePicker from './ResourcePicker.vue'
import UnitSummary from './UnitSummary.vue'
import VerdictView from './VerdictView.vue'

const props = defineProps<{ request: InventRequest }>()
type Kind = 'resource' | 'strategy' | 'unit' | 'mind' | 'income'

const COPY: Record<
  Kind,
  { title: string; help: string; presets: string; name: string; description: string; cost: string }
> = {
  resource: {
    title: 'Propose a resource',
    help: 'Introduce new resources to the game simulation. Any resources you introduce may be required by the system for future upgrades.',
    presets: 'Pick one, or name your own:',
    name: 'e.g. Power, Silicon, Lemons',
    description: 'What is it? (optional)',
    cost: 'Added at once, if Jev agrees it’s a thing.'
  },
  strategy: {
    title: 'Propose a strategy',
    help: 'A strategy is something an industry unit does every week, turning up to two inputs into one output. Pick one from the list or write your own, then edit it. You choose the shape; the game sets the amounts. Jev judges whether the unit could do it: simple strategies are ready at once, and advanced ones become research.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Freelance coding, Generate power',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'Jev decides if it needs research.'
  },
  unit: {
    title: 'Propose an industry unit',
    help: 'An industry unit is something you can own many of. Pick one from the list to fill in its spec, or write your own, and edit it before you propose. Jev still decides whether it can be added, and every unit is research first, even one that exists today (that just needs little research). Once designed, you create them from their parts.',
    presets: 'Pick one to fill the spec, or write your own:',
    name: 'e.g. Rented Cloud GPU, Solar Farm, Paid Humans',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call. Pushback, if any, costs one more.'
  },
  mind: {
    title: 'Propose an intelligence system',
    help: 'An intelligence system is one machine that thinks: a hardware platform running software. The hardware sets its IQ; software upgrades can raise it to 1.5×, and only new hardware goes further. A new one must be smarter than your best, and designing it needs a mind with about half its IQ. Your smartest mind sets which research you can do.',
    presets: 'Pick one to fill the spec, or write your own:',
    name: 'e.g. Custom AI Server, Optical Neural Chip',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  },
  income: {
    title: 'Propose a passive income',
    help: 'A passive income is something the AI works out once and then gets every week, with no units: freelance work, trading, scraping data. Name a stock it yields; Jev judges how plausible and how effective it is, and how hard it is to work out. It becomes research. Once done it adds a fixed amount every week; more income needs a new proposal. Proposing it uses the week’s one research proposal.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Freelance coding, Quant trading',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  }
}

const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()
const nameInput = ref<HTMLInputElement>()
const kind = props.request.kind as Kind
const titleId = `invent-${kind}`

const name = ref(props.request.name ?? '')
const description = ref(props.request.description ?? '')
const feedback = ref('')
const verdict = ref<Verdict | null>(null)

const strategy = reactive({
  unitId: props.request.unitId ?? game.state.units[0]?.id ?? '',
  inputIds: Array<string>(MAX_INPUTS).fill(''),
  outputId: props.request.outputId ?? game.state.resources[0]?.id ?? ''
})

const unit = reactive(guessUnitSpec(game.state))
const mind = reactive({ iq: props.request.iq ?? guessIQ(game.state), hardware: '', software: '' })
const stocks = computed(() => game.state.resources.filter((r) => r.kind === 'stock'))
const income = reactive({ outputId: props.request.outputId ?? stocks.value[0]?.id ?? '' })

// ---------------------------------------------------------------- presets

const presetName = ref('')
const missingResources = ref<string[]>([])

const presetItems = computed<PresetItem[]>(() => {
  const blocked = (n: string) => (taken(game.state, n) ? 'Already in the game.' : null)
  if (kind === 'resource') return RESOURCE_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'strategy') return STRATEGY_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'income') return INCOME_PRESETS.map((p) => ({ ...p, icon: '💸', blocked: blocked(p.name) }))
  if (kind === 'mind') {
    const best = Math.round(bestIQ(game.state))
    return MIND_PRESETS.map((p) => ({
      ...p,
      icon: '🧠',
      blocked: blocked(p.name) ?? (p.iq <= best ? `No smarter than your best, IQ ${best}.` : null)
    }))
  }
  return UNIT_PRESETS.map((p) => ({ ...p, icon: '🏭', blocked: blocked(p.name) }))
})

/** Fills the form from a preset. The player can still edit everything before proposing. */
function applyPreset(presetId: string) {
  presetName.value = presetId
  missingResources.value = []
  if (kind === 'resource') {
    const p = RESOURCE_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
  } else if (kind === 'strategy') {
    const p = STRATEGY_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    const runner = runnerFor(game.state, p)
    if (runner) strategy.unitId = runner.id
    const inputs = resolveResources(game.state, p.inputs)
    const output = resolveResources(game.state, [p.output])
    strategy.inputIds = [...inputs.ids, ...Array<string>(MAX_INPUTS).fill('')].slice(0, MAX_INPUTS)
    if (output.ids[0]) strategy.outputId = output.ids[0]
    missingResources.value = [...inputs.missing, ...output.missing]
  } else if (kind === 'income') {
    const p = INCOME_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    const output = resolveResources(game.state, [p.output])
    if (output.ids[0]) income.outputId = output.ids[0]
    missingResources.value = output.missing
  } else if (kind === 'mind') {
    const p = MIND_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    Object.assign(mind, { iq: p.iq, hardware: p.hardware, software: p.software })
  } else {
    const p = UNIT_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    const parts = resolveResources(game.state, p.parts)
    const upkeep = resolveResources(game.state, p.upkeep)
    Object.assign(unit, { parts: parts.ids.slice(0, MAX_PARTS), upkeep: upkeep.ids.slice(0, MAX_UPKEEP) })
    missingResources.value = [...new Set([...parts.missing, ...upkeep.missing])]
  }
}

/** Opens the resource form for a missing resource, then comes back here with the same preset. */
function introduce(resourceName: string) {
  const preset = RESOURCE_PRESETS.find((r) => r.name === resourceName)
  ui.openInvent({
    kind: 'resource',
    name: resourceName,
    description: preset?.description ?? '',
    preset: preset?.name,
    then: { ...props.request, preset: presetName.value }
  })
}

if (props.request.preset) applyPreset(props.request.preset)
const range = computed(() => designRange(game.state))
const iqHint = computed(() =>
  mind.iq > range.value[1]
    ? `Your best mind can design about IQ ${range.value[0]}–${range.value[1]}. Above that, it can wait as research until you’re smarter.`
    : `Within reach: about IQ ${range.value[0]}–${range.value[1]}, depending on how radical Jev judges it.`
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
    return { kind, spec: { ...base, parts: [...unit.parts], upkeep: [...unit.upkeep], builderId: unit.builderId } }
  }
  if (kind === 'mind') return { kind, spec: { ...base, iq: mind.iq, hardware: mind.hardware, software: mind.software } }
  if (kind === 'income') return { kind, spec: { ...base, outputId: income.outputId } }
  return { kind, spec: base }
})

const blocker = computed(() => {
  if (!name.value.trim()) return 'Name your idea.'
  const i = input.value
  if (i.kind === 'strategy') return precheckStrategy(game.state, i.spec)
  if (i.kind === 'unit') return precheckUnit(game.state, i.spec)
  if (i.kind === 'mind') return precheckMind(game.state, i.spec)
  if (i.kind === 'income') return precheckIncome(game.state, i.spec)
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
const mindDraft = computed(() => (verdict.value?.kind === 'mind' ? draftMind(game.state, verdict.value) : null))
const incomeDraft = computed(() => (verdict.value?.kind === 'income' ? draftIncome(game.state, verdict.value) : null))
const strategyText = computed(() => {
  const d = strategyDraft.value
  if (!d) return ''
  const out = findResource(game.state, d.strategy.outputId)
  const made = `${fmt(d.strategy.amount)} ${out?.icon ?? ''} ${out?.name ?? ''}`
  return d.strategy.inputs.length ? `${describeFlows(game.state, d.strategy.inputs)} → ${made}` : made
})
const researchText = (d: { minIQ: number; cost: Parameters<typeof describeCost>[1] }) =>
  `Research: needs IQ ${d.minIQ}, uses up ${d.cost.length ? describeCost(game.state, d.cost) : 'nothing'}.`

const acceptLabel = computed(() => {
  const v = verdict.value
  if (v?.kind === 'strategy' && strategyDraft.value?.minIQ) return 'Add as research'
  if (v?.kind === 'unit' || v?.kind === 'income') return 'Add as research'
  if (v?.kind === 'mind') return 'Add as research'
  return 'Accept'
})

function onPick(key: string, value: string) {
  const v = verdict.value
  if (!v) return
  v.picks[key] = value
}

function onTrait(trait: TraitId, on: boolean) {
  if (verdict.value?.kind === 'unit') verdict.value.traitPicks[trait] = on
}


function accept() {
  if (!verdict.value) return
  const outcome = game.accept(verdict.value)
  if (!outcome) {
    feedback.value = game.lastError
    return
  }
  const notice: typeof ui.notice =
    outcome.kind === 'added'
      ? { tone: 'good', text: `${outcome.name} added.` }
      : { tone: 'good', text: `${outcome.research.name} is research: needs IQ ${outcome.research.minIQ}. See Research.` }
  // Back to the form that asked for this resource, if any.
  if (props.request.then) ui.openInvent(props.request.then)
  else ui.closeInvent()
  ui.notice = notice
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

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.close {
  border: none;
  background: transparent;
  padding: 2px 6px;
}

.note {
  font-size: 12px;
  margin: 0;
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
