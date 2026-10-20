<template>
  <dialog ref="dialog" class="panel" aria-labelledby="breakthrough-title" @close="ui.closeInvent()">
    <div class="head">
      <div class="title">
        <HelpTip :text="HELP" />
        <h2 id="breakthrough-title">Propose a breakthrough</h2>
      </div>
      <button type="button" class="close" aria-label="Close" @click="ui.closeInvent()">✕</button>
    </div>

    <form v-if="!verdict" @submit.prevent="submit">
      <PresetList
        :items="presetItems"
        label="Pick one to fill in the changes, or make your own:"
        :selected="presetName"
        @pick="applyPreset"
      />
      <label class="field">
        <span>Change</span>
        <select v-model="targetKey" aria-label="What to change">
          <optgroup label="Units">
            <option v-for="u in game.state.units" :key="u.id" :value="`unit:${u.id}`">{{ u.icon }} {{ u.name }}</option>
          </optgroup>
          <optgroup v-if="strategies.length" label="Strategies">
            <option v-for="s in strategies" :key="s.id" :value="`strategy:${s.id}`">{{ s.name }}</option>
          </optgroup>
        </select>
      </label>

      <div v-if="unit" class="editor">
        <template v-if="unit.mind">
          <label class="field">
            <span>Software</span>
            <select v-model.number="form.software">
              <option :value="0">Keep {{ softwareLabel(unit) }}: IQ {{ Math.round(currentIQ(unit)) }}</option>
              <option v-for="s in iqSteps" :key="s" :value="s">
                Upgrade to {{ softwareVersion(unit.software.bonus + s) }}: IQ
                {{ Math.round(unit.hardware.iq * (1 + unit.software.bonus + s)) }}
              </option>
            </select>
          </label>
          <p v-if="!iqSteps.length" class="small warn rule">
            {{ unit.software.name }} is at the software ceiling of IQ {{ Math.round(ceilingIQ(unit)) }}. Smarter needs
            new hardware.
          </p>
          <label class="field">
            <span>Hardware</span>
            <select v-model.number="form.hwShare">
              <option :value="0">Keep {{ unit.hardware.name }}: hardware IQ {{ unit.hardware.iq }}</option>
              <option v-for="s in HARDWARE_STEPS" :key="s" :value="s">
                New hardware, +{{ Math.round(s * 100) }}%: hardware IQ {{ Math.round(unit.hardware.iq * (1 + s)) }}
              </option>
            </select>
          </label>
          <template v-if="form.hwShare">
            <p class="small warn rule">
              Hard to change: a much bigger project than software, Jev checks the new parts, and upkeep and price grow
              with the machine’s work.
            </p>
            <label class="field">
              <span>Named</span>
              <input v-model="form.hwName" :maxlength="NAME_MAX" aria-label="New hardware name" />
            </label>
            <div class="field">
              <span>Made from</span>
              <ResourcePicker v-model="form.hwParts" :max="MAX_PARTS" label="Add a part" />
            </div>
          </template>
        </template>
        <label v-for="f in unit.upkeep" :key="`u-${f.resourceId}`" class="field">
          <span>{{ resName(f.resourceId) }} upkeep</span>
          <select v-model.number="form.upkeep[f.resourceId]">
            <option :value="1">Keep {{ fmt(f.amount) }} a week</option>
            <option v-for="x in FACTORS" :key="x" :value="x">{{ x ? `×${x} → ${fmt(f.amount * x)}` : 'Remove it' }}</option>
          </select>
        </label>
        <label v-for="f in unit.parts" :key="`p-${f.resourceId}`" class="field">
          <span>{{ resName(f.resourceId) }} per build</span>
          <select v-model.number="form.parts[f.resourceId]">
            <option :value="1">Keep {{ fmt(f.amount) }}</option>
            <option v-for="x in FACTORS" :key="x" :value="x">{{ x ? `×${x} → ${fmt(f.amount * x)}` : 'Remove it' }}</option>
          </select>
        </label>
        <div v-if="unit.traits.length" class="field">
          <span>Remove</span>
          <span class="row">
            <label v-for="t in unit.traits" :key="t" class="choice small">
              <input v-model="form.remove" type="checkbox" :value="t" /> {{ TRAITS[t].icon }} {{ TRAITS[t].name }}
            </label>
          </span>
        </div>
        <label class="field">
          <span>Add trait</span>
          <select v-model="form.addTrait">
            <option value="">None</option>
            <optgroup v-for="g in addableGroups" :key="g.label" :label="g.label">
              <option v-for="t in g.traits" :key="t.id" :value="t.id">{{ t.icon }} {{ t.name }}</option>
            </optgroup>
          </select>
        </label>
        <p v-if="form.addTrait" class="small muted rule">{{ TRAITS[form.addTrait].rule }}</p>
        <label v-if="paramOptions.length" class="field">
          <span>Applies to</span>
          <select v-model="form.param">
            <option v-for="o in paramOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
        </label>
        <template v-if="!unit.starting">
          <label v-if="!unit.layers.own" class="choice">
            <input v-model="form.own" type="checkbox" />
            <span>Make our own: an own-industry layer, about 100× humanity’s</span>
          </label>
          <template v-if="form.own">
            <label class="field">
              <span>Built by</span>
              <select v-model="form.builderId">
                <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
              </select>
            </label>
            <div class="field">
              <span>Made from</span>
              <ResourcePicker v-model="form.ownParts" :max="MAX_PARTS" label="Add a part" />
            </div>
          </template>
          <label v-if="unit.layers.own && !unit.layers.earth" class="choice">
            <input v-model="form.earth" type="checkbox" />
            <span>Reach Earth’s limit: clear a planetary bottleneck (about 100× your own industry)</span>
          </label>
        </template>
      </div>

      <div v-else-if="strategy" class="editor">
        <label class="field">
          <span>Output</span>
          <select v-model.number="form.output">
            <option :value="1">Keep {{ fmt(strategy.amount) }}</option>
            <option v-for="x in OUTPUT_FACTORS" :key="x" :value="x">×{{ x }} → {{ fmt(strategy.amount * x) }}</option>
          </select>
        </label>
        <label v-for="f in strategy.inputs" :key="f.resourceId" class="field">
          <span>{{ resName(f.resourceId) }} used</span>
          <select v-model.number="form.inputs[f.resourceId]">
            <option :value="1">Keep {{ fmt(f.amount) }}</option>
            <option v-for="x in FACTORS" :key="x" :value="x">{{ x ? `×${x} → ${fmt(f.amount * x)}` : 'Remove it' }}</option>
          </select>
        </label>
      </div>

      <input v-model="name" :maxlength="NAME_MAX" placeholder="Name it, e.g. Liquid cooling" aria-label="Name" />
      <textarea v-model="description" rows="2" :maxlength="DESCRIPTION_MAX" placeholder="How does it work?" aria-label="How it works" />

      <div v-if="changes.length" class="compare">
        <div>
          <div class="small muted">Before</div>
          <UnitSummary v-if="unit" :unit="unit" :state="game.state" />
          <div v-else-if="strategy" class="small">{{ strategyLine(strategy) }}</div>
        </div>
        <div>
          <div class="small muted">After</div>
          <UnitSummary v-if="after.unit" :unit="after.unit" :state="afterState" />
          <div v-else-if="after.strategy" class="small">{{ strategyLine(after.strategy) }}</div>
        </div>
      </div>

      <p v-if="feedback" class="feedback">{{ feedback }}</p>
      <div class="submit">
        <span class="muted small">{{ blocker ?? 'One Jev call. The bar is a little higher than for units.' }}</span>
        <button class="primary" type="submit" :disabled="!game.canPropose || !!blocker">
          {{ game.busy ? 'Jev is judging…' : 'Propose' }}
        </button>
      </div>
    </form>

    <VerdictView
      v-else
      :verdict="verdict"
      accept-label="Start research"
      @pick="(k, v) => (verdict!.picks[k] = v)"
      @replace="(v) => (verdict = v as BreakthroughVerdict)"
      @accept="accept"
      @edit="verdict = null"
    >
      <div v-if="draft" class="small outcome">
        <div v-for="c in withCatches(verdict)" :key="JSON.stringify(c)">• {{ describeChange(game.state, verdict.spec.target, c) }}</div>
        <div class="warn">Research project: bar IQ {{ draft.bar }}, size {{ fmt(draft.size) }} ({{ FIELD_LABELS[draft.field] }}).</div>
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { FIELD_LABELS, HARDWARE_STEPS, IQ_STEPS, MAX_PARTS } from '@/engine/balance'
import {
  describeChange,
  draftBreakthrough,
  FACTORS,
  OUTPUT_FACTORS,
  precheckBreakthrough,
  previewChanges,
  withCatches,
  type BreakthroughSpec,
  type BreakthroughVerdict
} from '@/engine/breakthroughProposal'
import {
  ceilingIQ,
  currentIQ,
  describeFlows,
  findResource,
  findStrategy,
  findUnit,
  fmt,
  iqRoom,
  MONEY_ID,
  softwareLabel,
  softwareVersion
} from '@/engine/model'
import { BREAKTHROUGH_PRESETS, matchUpkeep, presetBlocker, taken } from '@/engine/presets'
import { DESCRIPTION_MAX, NAME_MAX } from '@/engine/proposals'
import { traitsFor, TRAITS, type TraitId } from '@/engine/traits'
import { FIELDS, type Change, type GameState, type Strategy, type UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import HelpTip from './HelpTip.vue'
import PresetList, { type PresetItem } from './PresetList.vue'
import ResourcePicker from './ResourcePicker.vue'
import UnitSummary from './UnitSummary.vue'
import VerdictView from './VerdictView.vue'

const props = defineProps<{ request: InventRequest }>()
const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()

const strategies = computed(() => game.state.strategies.filter((s) => s.kind === 'make'))
const first = props.request.target ?? { kind: 'unit' as const, id: game.state.units[0]!.id }
const targetKey = ref(`${first.kind}:${first.id}`)
const target = computed<BreakthroughSpec['target']>(() => {
  const [kind, ...rest] = targetKey.value.split(':')
  return { kind: kind === 'strategy' ? 'strategy' : 'unit', id: rest.join(':') }
})
const unit = computed(() => (target.value.kind === 'unit' ? findUnit(game.state, target.value.id) : undefined))
const strategy = computed(() =>
  target.value.kind === 'strategy' ? findStrategy(game.state, target.value.id) : undefined
)

const name = ref('')
const description = ref('')
const feedback = ref('')
const verdict = ref<BreakthroughVerdict | null>(null)

function blankForm() {
  const u = unit.value
  const wantsLayer = props.request.change === 'layer'
  return {
    software: 0,
    hwShare: 0,
    hwName: u?.mind ? `${u.hardware.name} Mk II` : '',
    hwParts: u?.parts.length ? u.parts.map((p) => p.resourceId) : [MONEY_ID],
    upkeep: Object.fromEntries((u?.upkeep ?? []).map((f) => [f.resourceId, 1])) as Record<string, number>,
    parts: Object.fromEntries((u?.parts ?? []).map((f) => [f.resourceId, 1])) as Record<string, number>,
    remove: [] as TraitId[],
    addTrait: '' as TraitId | '',
    param: '',
    own: wantsLayer && !!u && !u.layers.own,
    builderId: game.state.units.find((x) => !x.mind && x.id !== u?.id)?.id ?? game.state.units[0]!.id,
    ownParts: u?.parts.length ? u.parts.map((p) => p.resourceId) : [MONEY_ID],
    earth: wantsLayer && !!u?.layers.own && !u.layers.earth,
    output: 1,
    inputs: Object.fromEntries((strategy.value?.inputs ?? []).map((f) => [f.resourceId, 1])) as Record<string, number>
  }
}
const form = reactive(blankForm())
watch(targetKey, () => {
  Object.assign(form, blankForm())
  presetName.value = ''
})

const HELP =
  'A breakthrough changes something you already own. Pick a unit or strategy, then pick an idea from the list or edit a copy of its card yourself, and say how it works in a line. Software upgrades raise an intelligence system’s IQ, up to 1.5× its hardware. New hardware lifts that ceiling, but it’s much harder: a far bigger project, parts Jev must agree with, and more upkeep. Jev judges plausibility and difficulty, and its bar is a little higher than for units. The bigger the gain, the bigger the research project.'

// ---------------------------------------------------------------- presets

const presetName = ref('')
const presetItems = computed<PresetItem[]>(() =>
  BREAKTHROUGH_PRESETS.map((p) => ({
    name: p.name,
    description: p.description,
    icon: p.on === 'strategy' ? '🧭' : p.hardware ? '🔩' : p.software ? '💾' : '💡',
    blocked: taken(game.state, p.name)
      ? 'Already researched or under way.'
      : presetBlocker(game.state, p, unit.value, strategy.value)
  }))
)

/** Fills in the changes from a preset. The player can still edit everything before proposing. */
function applyPreset(presetId: string) {
  const p = BREAKTHROUGH_PRESETS.find((x) => x.name === presetId)
  const u = unit.value
  const s = strategy.value
  if (!p || presetBlocker(game.state, p, u, s)) return
  Object.assign(form, blankForm())
  presetName.value = p.name
  name.value = p.name
  description.value = p.description
  if (p.software) form.software = p.software
  if (p.hardware && u) {
    form.hwShare = p.hardware.share
    form.hwName = p.hardware.name(u.hardware.name)
  }
  const upkeep = p.upkeep && u ? matchUpkeep(game.state, u, p.upkeep.match) : undefined
  if (upkeep && p.upkeep) form.upkeep[upkeep.resourceId] = p.upkeep.factor
  if (p.parts && u) for (const f of u.parts) form.parts[f.resourceId] = p.parts
  if (p.addTrait) form.addTrait = p.addTrait
  if (p.removeTrait) form.remove = [p.removeTrait]
  if (p.layer === 'own') form.own = true
  if (p.layer === 'earth') form.earth = true
  if (p.output) form.output = p.output
  if (p.inputs && s) for (const f of s.inputs) form.inputs[f.resourceId] = p.inputs
}
if (props.request.preset) applyPreset(props.request.preset)

const iqSteps = computed(() => (unit.value ? IQ_STEPS.filter((s) => s <= iqRoom(unit.value!) + 1e-9) : []))
const addable = computed(() =>
  unit.value ? traitsFor(unit.value.mind).filter((t) => !unit.value!.traits.includes(t.id)) : []
)
const addableGroups = computed(() =>
  (
    [
      ['Perks', 'perk'],
      ['Mixed', 'mixed'],
      ['Drawbacks', 'drawback']
    ] as const
  )
    .map(([label, kind]) => ({ label, traits: addable.value.filter((t) => t.kind === kind) }))
    .filter((g) => g.traits.length)
)
const paramOptions = computed(() => {
  const t = form.addTrait ? TRAITS[form.addTrait] : null
  if (!t?.param) return []
  const s = game.state
  switch (t.param) {
    case 'unit':
      return s.units.filter((u) => u.id !== unit.value?.id).map((u) => ({ id: u.id, name: u.name }))
    case 'resource':
      return s.resources.map((r) => ({ id: r.id, name: r.name }))
    case 'flow':
      return s.resources.filter((r) => r.kind === 'flow').map((r) => ({ id: r.id, name: r.name }))
    case 'field':
      return FIELDS.map((f) => ({ id: f, name: FIELD_LABELS[f]! }))
  }
  return []
})
watch(paramOptions, (opts) => {
  if (!opts.some((o) => o.id === form.param)) form.param = opts[0]?.id ?? ''
})

const changes = computed<Change[]>(() => {
  const out: Change[] = []
  if (unit.value) {
    if (form.software) out.push({ kind: 'software', share: form.software })
    if (form.hwShare) {
      out.push({ kind: 'hardware', name: form.hwName.trim(), share: form.hwShare, parts: [...form.hwParts] })
    }
    for (const [resourceId, factor] of Object.entries(form.upkeep)) if (factor !== 1) out.push({ kind: 'upkeep', resourceId, factor })
    for (const [resourceId, factor] of Object.entries(form.parts)) if (factor !== 1) out.push({ kind: 'parts', resourceId, factor })
    for (const trait of form.remove) out.push({ kind: 'trait', trait, add: false })
    if (form.addTrait) out.push({ kind: 'trait', trait: form.addTrait, add: true })
    if (form.own && !unit.value.layers.own) {
      out.push({ kind: 'layer', layer: 'own', builderId: form.builderId, parts: [...form.ownParts] })
    }
    if (form.earth) out.push({ kind: 'layer', layer: 'earth', builderId: null, parts: [] })
  } else if (strategy.value) {
    if (form.output !== 1) out.push({ kind: 'output', factor: form.output })
    for (const [resourceId, factor] of Object.entries(form.inputs)) if (factor !== 1) out.push({ kind: 'input', resourceId, factor })
  }
  return out
})

const spec = computed<BreakthroughSpec>(() => ({
  name: name.value,
  description: description.value,
  target: target.value,
  changes: changes.value,
  params: form.addTrait && form.param ? [{ trait: form.addTrait, param: form.param }] : []
}))

/** The card after the changes, worked out on a copy (a plain one, so it can be cloned). */
const after = computed<{ state?: GameState; unit?: UnitType; strategy?: Strategy }>(() =>
  changes.value.length ? previewChanges(JSON.parse(JSON.stringify(game.state)) as GameState, spec.value) : {}
)
const afterState = computed(() => after.value.state ?? game.state)
const blocker = computed(() => {
  if (!changes.value.length) return 'Change something on the card.'
  if (!name.value.trim()) return 'Name your idea.'
  return precheckBreakthrough(game.state, spec.value)
})
const draft = computed(() => (verdict.value ? draftBreakthrough(game.state, verdict.value) : null))

const resName = (id: string) => findResource(game.state, id)?.name ?? '?'
function strategyLine(s: Strategy) {
  const out = findResource(game.state, s.outputId)
  const made = `${fmt(s.amount)} ${out?.icon ?? ''} ${out?.name ?? '?'}`
  return s.inputs.length ? `${describeFlows(game.state, s.inputs)} → ${made} each a week` : `${made} each a week`
}

onMounted(async () => {
  dialog.value?.showModal?.()
  await nextTick()
})

async function submit() {
  if (blocker.value) return
  feedback.value = ''
  const v = await game.propose({ kind: 'breakthrough', spec: spec.value })
  if (!v || v.kind !== 'breakthrough') {
    feedback.value = game.lastError
    return
  }
  verdict.value = v
}

function accept() {
  if (!verdict.value) return
  const outcome = game.accept(verdict.value)
  if (!outcome) {
    feedback.value = game.lastError
    return
  }
  if (outcome.kind === 'project') {
    ui.notice = { tone: 'good', text: `${outcome.project.name}: bar IQ ${outcome.project.bar}. Put minds on it in Projects.` }
  }
  ui.closeInvent()
}
</script>

<style scoped>
dialog {
  width: min(640px, calc(100vw - 32px));
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

.editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
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

.rule {
  margin: -4px 0 0 100px;
}

.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 560px) {
  .compare {
    grid-template-columns: 1fr;
  }
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
  gap: 4px;
}
</style>
