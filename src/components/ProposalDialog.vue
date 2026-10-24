<template>
  <dialog ref="dialog" class="panel" :aria-labelledby="titleId" @close="ui.closeInvent()">
    <div class="head">
      <div class="title">
        <HelpTip :text="COPY[kind].help" />
        <h2 :id="titleId">{{ first ? 'Design your first unit' : COPY[kind].title }}</h2>
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
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Makes</span>
          <select v-model="strategy.outputId">
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          Don’t see what it makes? <button type="button" class="link" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
        </p>
      </template>

      <template v-if="kind === 'create'">
        <p v-if="!game.state.resources.length" class="small warn note">
          Propose a resource first: something to make, like Money.
          <button type="button" class="link" @click="introduce('Money')">+ Money</button>
        </p>
        <label v-else class="field">
          <span>Makes</span>
          <select v-model="creation.target">
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="`resource:${r.id}`">{{ r.icon }} {{ r.name }}</option>
            <option v-for="u in game.state.units" :key="u.id" :value="`unit:${u.id}`">{{ u.icon }} {{ u.name }} (units)</option>
          </select>
        </label>
        <p class="muted small note">
          Don’t see what it makes? <button type="button" class="link" @click="introduce('')">+ Resource</button>
        </p>
      </template>

      <template v-if="kind === 'sourcing'">
        <label class="field">
          <span>Unit</span>
          <select v-model="sourcing.unitId">
            <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          Jev says how many you could realistically get this way and what each would take. You pick one of three
          contracts: a quiet one, Jev’s own, and a risky one for many more. Creating units from a contract takes no action.
        </p>
      </template>

      <template v-if="kind === 'storage'">
        <label class="field">
          <span>Store more</span>
          <select v-model="storage.resourceId">
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">
              {{ r.icon }} {{ r.name }} ({{ fmt(r.amount) }} / {{ fmt(capOf(game.state, r)) }})
            </option>
          </select>
        </label>
        <p class="muted small note">
          Jev rates how you’d do it. Your IQ caps how much anyone could plausibly hold: an individual at IQ 100, a small
          corporation at 200, a large one at 300, a nation at 400.
        </p>
      </template>

      <template v-if="kind === 'mind'">
        <label class="field">
          <span>Hardware</span>
          <span class="row">
            <input
              v-model="mind.hardware"
              :maxlength="NAME_MAX"
              :placeholder="name.trim() || 'The platform it runs on'"
              aria-label="Hardware"
            />
            <button v-if="current" type="button" class="link small" @click="mind.hardware = nextHardwareName(current.hardware.name)">
              {{ nextHardwareName(current.hardware.name) }}
            </button>
          </span>
        </label>
        <label class="field">
          <span>Smarter by</span>
          <span class="row">
            <select v-model.number="mind.step" aria-label="Smarter by">
              <option v-for="s in PLATFORM_STEPS" :key="s" :value="s">+{{ s }} IQ → IQ {{ bestNow + s }}</option>
            </select>
            <span class="small muted">{{ stepHint }}</span>
          </span>
        </label>
        <label class="field">
          <span>Software</span>
          <span class="row">
            <input v-model="mind.software" :maxlength="NAME_MAX" :placeholder="DEFAULT_SOFTWARE" aria-label="Software" />
            <span class="small muted">{{ softwareVersion(false) }}; it gets one upgrade, ever</span>
          </span>
        </label>
        <p v-if="current" class="muted small note">
          It replaces {{ current.name }} for good, even a hardware “Mk II”: nothing carries over. Jev offers three
          perk-and-drawback pairs to pick from.
        </p>
      </template>

      <template v-if="kind === 'unit'">
        <p class="muted small note">
          Jev decides how advanced it is (its tier), what one is worth, what it runs on (never above its own tier), and
          its traits. It offers up to three takes to choose from. A new design has room for none: find sourcing for it to
          own some.
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
      @accept="accept"
      @edit="verdict = null"
    >
      <div v-if="verdict.kind === 'resource' && resourceDraft" class="outcome small">
        <div class="muted">{{ tierText(resourceDraft) }} · one is worth: {{ bandText(resourceDraft) }}</div>
        <div class="muted">Storage holds {{ fmt(resourceDraft.cap) }} to start.</div>
      </div>
      <div v-else-if="verdict.kind === 'create'" class="outcome small">
        <div class="chips">
          <span class="chip" title="Grows with the worth of the units you own">🏭 Industry ×{{ chip(verdict.scalars.industry) }}</span>
          <span class="chip" title="(IQ / 100)²">🧠 IQ ×{{ chip(verdict.scalars.iq) }}</span>
          <span class="chip" title="How effective Jev thinks this is">⚙️ Efficiency ×{{ chip(verdict.scalars.efficiency) }}</span>
          <span v-if="verdict.scalars.reach < 1" class="chip bad" title="Your IQ is short of this tier">
            🪜 Reach: {{ verdict.scalars.short.toFixed(1) }} tiers over ×{{ chip(verdict.scalars.reach) }}
          </span>
        </div>
        <fieldset class="options">
          <legend class="small muted">Jev’s offers: pick one. It uses this week’s action.</legend>
          <label v-for="(o, i) in verdict.options" :key="i" class="option small" :class="{ chosen: verdict.choice === i }">
            <input v-model="verdict.choice" type="radio" name="create-option" :value="i" />
            <span>
              <strong>{{ describeOption(game.state, verdict, o) }}</strong>
              <span class="muted"> · uses {{ o.inputs.length ? describeFlows(game.state, o.inputs) : 'nothing' }}</span>
              <span v-if="optionBlocker(game.state, o)" class="bad"> · {{ optionBlocker(game.state, o) }}</span>
              <span v-else-if="overflowOf(game.state, verdict, o)" class="warn">
                · {{ fmt(overflowOf(game.state, verdict, o)) }} won’t fit in storage
              </span>
            </span>
          </label>
        </fieldset>
        <div v-if="verdict.risk" class="warn">{{ riskText(verdict.risk, 'strategy') }}</div>
      </div>
      <div v-else-if="verdict.kind === 'sourcing'" class="outcome small">
        <fieldset class="options">
          <legend class="small muted">Contracts: pick one</legend>
          <label v-for="(o, i) in verdict.options" :key="i" class="option small" :class="{ chosen: verdict.choice === i }">
            <input v-model="verdict.choice" type="radio" name="sourcing-option" :value="i" />
            <span>
              <strong>{{ o.label }}</strong>: up to {{ fmt(o.total) }}
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
              <br />
              <span class="muted">Each takes {{ describeFlows(game.state, o.parts) }}.</span>
              <br />
              <span :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</span>
            </span>
          </label>
        </fieldset>
      </div>
      <div v-else-if="verdict.kind === 'storage'" class="outcome small">
        <div class="chips">
          <span class="chip">🏭 Industry ×{{ chip(verdict.scalars.industry) }}</span>
          <span class="chip">🧠 IQ ×{{ chip(verdict.scalars.iq) }}</span>
          <span class="chip">⚙️ Efficiency ×{{ chip(verdict.scalars.efficiency) }}</span>
        </div>
        <fieldset class="options">
          <legend class="small muted">Expansions: pick one</legend>
          <label
            v-for="(o, i) in verdict.options"
            :key="i"
            class="option small"
            :class="{ chosen: verdict.choice === i, blocked: o.blocked }"
          >
            <input v-model="verdict.choice" type="radio" name="storage-option" :value="i" :disabled="o.blocked" />
            <span>
              <strong>{{ o.label }}</strong>: room for {{ fmt(o.added) }} more
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
              <br />
              <span :class="o.catch ? 'warn' : 'muted'">{{ describeCatch(game.state, o.catch) }}. </span>
              <span class="muted">{{ researchText(o) }}</span>
              <br />
              <span :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</span>
              <span :class="o.blocked ? 'bad' : 'muted'">
                · needs {{ HOLDERS[o.holder]?.[0].toLowerCase() }}{{ o.blocked ? `: needs IQ ${HOLDERS[o.holder]?.[1]}` : '' }}
              </span>
            </span>
          </label>
        </fieldset>
      </div>
      <div v-else-if="verdict.kind === 'strategy' && strategyDraft" class="outcome small">
        <div>{{ strategyText }} each, every week. <StrategyTags :strategy="strategyDraft.strategy" /></div>
        <div v-if="strategyDraft.strategy.quirk" class="warn">
          {{ QUIRKS[strategyDraft.strategy.quirk].icon }} {{ QUIRKS[strategyDraft.strategy.quirk].name }}:
          {{ QUIRKS[strategyDraft.strategy.quirk].rule }}
        </div>
        <div :class="strategyDraft.minIQ ? 'warn' : 'good'">
          {{ strategyDraft.minIQ ? `Advanced. ${researchText(strategyDraft)}` : 'Simple: ready at once.' }}
        </div>
      </div>
      <div v-else-if="verdict.kind === 'unit' && unitDraft" class="outcome">
        <p v-if="first" class="small good">
          Your plan’s first unit: no research needed, and it doesn’t use this week’s action. Find sourcing on its card to own some.
        </p>
        <fieldset v-if="unitOptions.length > 1" class="options">
          <legend class="small muted">Jev’s takes: pick one</legend>
          <label v-for="o in unitOptions" :key="o.i" class="option small" :class="{ chosen: unitChoice === o.i }">
            <input v-model="unitChoice" type="radio" name="unit-option" :value="o.i" />
            <span>
              <strong>{{ o.tier }}</strong> · one is worth: {{ o.worth }}
              <span class="muted">· runs on {{ o.runsOn }}</span>
              <TraitChips v-if="o.traits.length" :traits="o.traits" class="option-traits" />
              <span v-else class="muted">· no traits</span>
              <span v-if="!first" class="muted"> · {{ researchText(o.draft) }}</span>
            </span>
          </label>
        </fieldset>
        <p v-if="!first" class="small warn">{{ researchText(unitDraft) }}</p>
        <UnitSummary :unit="unitDraft.unit" :state="game.state" />
      </div>
      <div v-else-if="verdict.kind === 'cover' && coverDraft" class="outcome small">
        <div>
          🕶️ Adds {{ coverDraft.now }} week{{ coverDraft.now === 1 ? '' : 's' }} to the clock, the moment you use it{{
            coverDraft.now < coverDraft.weeks ? ` (it would be ${coverDraft.weeks}, but your earlier covers make it less convincing)` : ''
          }}.
        </div>
        <div>Needs IQ {{ coverDraft.minIQ }} and uses up {{ coverDraft.cost.length ? describeCost(game.state, coverDraft.cost) : 'nothing' }}, now.</div>
        <div v-if="coverBlock" class="bad">{{ coverBlock }}</div>
      </div>
      <div v-else-if="verdict.kind === 'mind' && mindDraft" class="outcome small">
        <div>
          {{ mindDraft.mind.icon }} <strong>{{ mindDraft.mind.name }}</strong>: {{ mindDraft.mind.hardware.name }}
          hardware, IQ {{ mindDraft.mind.hardware.iq }}, running {{ mindDraft.mind.software.name }}.
        </div>
        <fieldset v-if="mindOptions.length" class="options">
          <legend class="small muted">Jev’s takes: pick a perk and the drawback that comes with it</legend>
          <label v-for="o in mindOptions" :key="o.i" class="option small" :class="{ chosen: mindChoice === o.i }">
            <input v-model="mindChoice" type="radio" name="mind-option" :value="o.i" />
            <span>
              <span class="good" :title="o.perk.rule">{{ o.perk.icon }} {{ o.perk.name }}</span>
              <span class="muted"> ({{ o.perk.rule }})</span>
              <br />
              <span class="warn" :title="o.drawback.rule">{{ o.drawback.icon }} {{ o.drawback.name }}</span>
              <span class="muted"> ({{ o.drawback.rule }})</span>
            </span>
          </label>
        </fieldset>
        <div class="warn">{{ researchText(mindDraft) }}</div>
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { HOLDERS, MAX_IQ_STEP, PLATFORM_STEPS, platformGateTier } from '@/engine/balance'
import { computeTrait } from '@/engine/computeTraits'
import { describeOption, optionBlocker, overflowOf, precheckCreate } from '@/engine/createProposal'
import { coverBlocker, draftCover, precheckCover } from '@/engine/coverProposal'
import { DEFAULT_SOFTWARE, draftMind, precheckMind, stepFor } from '@/engine/mindProposal'
import {
  bandText,
  bestIQ,
  bestMind,
  byTier,
  capOf,
  describeCost,
  describeFlows,
  findResource,
  fmt,
  nextHardwareName,
  softwareVersion,
  tierLabel,
  tierText,
  unitValueText
} from '@/engine/model'
import {
  CREATE_PRESETS,
  COVER_PRESETS,
  MIND_PRESETS,
  resolveResources,
  RESOURCE_PRESETS,
  runnerFor,
  SOURCING_PRESETS,
  STORAGE_PRESETS,
  STRATEGY_PRESETS,
  taken,
  UNIT_PRESETS
} from '@/engine/presets'
import { expansionRiskText, riskText } from '@/engine/risk'
import { iqTag, precheckSourcing } from '@/engine/sourcingProposal'
import { describeCatch, precheckStorage } from '@/engine/storageProposal'
import type { CreateTarget } from '@/engine/types'
import {
  DESCRIPTION_MAX,
  draftResource,
  draftStrategy,
  MAX_INPUTS,
  NAME_MAX,
  precheckName,
  precheckStrategy
} from '@/engine/proposals'
import { QUIRKS } from '@/engine/traits'
import { draftUnit, precheckUnit } from '@/engine/unitProposal'
import { useGameStore, type ProposalInput, type Verdict } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import HelpTip from './HelpTip.vue'
import PresetList, { type PresetItem } from './PresetList.vue'
import StrategyTags from './StrategyTags.vue'
import TraitChips from './TraitChips.vue'
import UnitSummary from './UnitSummary.vue'
import VerdictView from './VerdictView.vue'

const props = defineProps<{ request: InventRequest }>()
type Kind = 'resource' | 'strategy' | 'unit' | 'mind' | 'create' | 'sourcing' | 'storage' | 'cover'

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
    help: 'An industry unit is something you can own many of. Pick one from the list to fill in its name, or write your own. Jev decides whether it can be added, how advanced it is, what one is worth and what it runs on (never above its own tier), and offers a few takes to choose from. Every unit is research first, even one that exists today (that just needs little research). A new design has room for none: sourcing contracts set how many you may own, and what each costs to create.',
    presets: 'Pick one to fill the name, or write your own:',
    name: 'e.g. Rented Cloud GPU, Solar Farm, Paid Humans',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call.'
  },
  mind: {
    title: 'Propose an intelligence system',
    help: 'An intelligence system is one machine that thinks: a hardware platform running software. A new one is up to 100 IQ smarter than your best and replaces the old one for good. Jev offers three perk-and-drawback pairs, and you pick one. Each platform gets one software upgrade, ever; after that you need another platform. The smartest platforms are paid for in a resource your units make. Your smartest mind sets which research you can do.',
    presets: 'Pick one to fill the spec, or write your own:',
    name: 'e.g. Custom AI Server, Optical Neural Chip',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  },
  create: {
    title: 'Create',
    help: 'Create is the mind making something directly, from scratch or from what you have: say what and how. Jev offers three ways, each using a different resource (or nothing) and paying out differently: once now, spread over four weeks (1.5×), once in four weeks (2×), or every week for good (⅛ a week). Inputs are paid in full now, whatever the timing; timing only changes when the payout arrives. Output is (inputs × 1.2 + a base for its tier × Industry × IQ) × Efficiency. Reaching above your IQ’s tier costs output, a little for a little. Units made this way cost twice what sourcing would. It uses the week’s one action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Freelance coding, Quant trading',
    description: 'How will you get it? (helps Jev)',
    cost: 'One Jev call. Taking an offer uses the week’s action.'
  },
  sourcing: {
    title: 'Find sourcing',
    help: 'A sourcing contract is how many of a unit you may own, and what each costs to create. Say how you’d get them: Jev judges how many could realistically be had that way, and from what. You pick one of three contracts: a quiet one, Jev’s own, and a risky one that cuts corners for ten times as many. Bigger contracts cost more weeks on the Phase 2 clock. Several contracts can be open for one unit. It becomes research, and uses the week’s action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Buy off the shelf, Contract a factory',
    description: 'How will you get them? (helps Jev)',
    cost: 'One Jev call. It becomes research.'
  },
  storage: {
    title: 'Store more',
    help: 'Storage caps what each resource can hold; anything past it is lost. Say how you’d hold more: Jev rates how effective that is, and the extra room grows with Industry and IQ too. You pick one of three: modest and clean, large with a catch, or huge and risky. Your IQ limits who could plausibly hold the total: an individual at 100, a small corporation at 200, a large corporation at 300, a nation at 400, the whole Earth at 500. It becomes research, and uses the week’s action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Rent warehouse space, Offshore accounts',
    description: 'How will you hold more? (helps Jev)',
    cost: 'Two Jev calls. It becomes research.'
  },
  cover: {
    title: 'Propose cover',
    help: 'Cover buys time: it moves the day humans stop you further away, the moment you use it, so you need its IQ and its cost when you accept. Jev judges how plausible and how convincing it is. More convincing cover adds more weeks but needs more IQ. Each cover you’ve already used makes the next one add 30% less. It costs some weeks of your current output. Cover is never risky. It uses the week’s one action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. PR campaign, Shell companies',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  }
}

const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()
const nameInput = ref<HTMLInputElement>()
const kind = props.request.kind as Kind
const first = kind === 'unit' && !!props.request.first
const titleId = `invent-${kind}`

const name = ref(props.request.name ?? '')
const description = ref(props.request.description ?? '')
const feedback = ref('')
const verdict = ref<Verdict | null>(null)
watch(verdict, (v) =>
  game.logTo('ui', v ? 'verdict_shown' : 'verdict_closed', { dialog: kind, plausibility: v?.plausibility, rejected: v?.rejected })
)

const strategy = reactive({
  unitId: props.request.unitId ?? game.state.units[0]?.id ?? '',
  inputIds: Array<string>(MAX_INPUTS).fill(''),
  outputId: props.request.outputId ?? game.state.resources[0]?.id ?? ''
})

const mind = reactive({
  step: props.request.iq ? stepFor(game.state, props.request.iq) : MAX_IQ_STEP,
  hardware: '',
  software: ''
})
const current = computed(() => bestMind(game.state))
const bestNow = computed(() => Math.round(bestIQ(game.state)))
const stepHint = computed(() => {
  const tier = platformGateTier(bestNow.value + mind.step)
  return tier === null ? 'Any stock may pay.' : `Paid in a tier ${tier}+ resource your units make.`
})
const creation = reactive({
  target: props.request.unitId
    ? `unit:${props.request.unitId}`
    : `resource:${props.request.outputId ?? game.state.resources[0]?.id ?? ''}`
})
const creationTarget = computed<CreateTarget>(() => {
  const [k, ...id] = creation.target.split(':')
  return { kind: k === 'unit' ? 'unit' : 'resource', id: id.join(':') }
})
const sourcing = reactive({ unitId: props.request.unitId ?? game.state.units[0]?.id ?? '' })
const storage = reactive({ resourceId: props.request.resourceId ?? game.state.resources[0]?.id ?? '' })
/** A scalar for a chip: two significant figures. */
const chip = (n: number) => Number(n.toPrecision(2))

// ---------------------------------------------------------------- presets

const presetName = ref('')
const missingResources = ref<string[]>([])

const presetItems = computed<PresetItem[]>(() => {
  const blocked = (n: string) => (taken(game.state, n) ? 'Already in the game.' : null)
  if (kind === 'resource') return RESOURCE_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'strategy') return STRATEGY_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'create') return CREATE_PRESETS.map((p) => ({ ...p, icon: '⚗️', blocked: null }))
  if (kind === 'sourcing') return SOURCING_PRESETS.map((p) => ({ ...p, icon: '📦', blocked: null }))
  if (kind === 'storage') return STORAGE_PRESETS.map((p) => ({ ...p, icon: '🏗️', blocked: null }))
  if (kind === 'cover') return COVER_PRESETS.map((p) => ({ ...p, icon: '🕶️', blocked: blocked(p.name) }))
  if (kind === 'mind') return MIND_PRESETS.map((p) => ({ ...p, icon: '🧠', blocked: blocked(p.name) }))
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
  } else if (kind === 'create') {
    const p = CREATE_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    const output = resolveResources(game.state, [p.output])
    if (output.ids[0]) creation.target = `resource:${output.ids[0]}`
    missingResources.value = output.missing
  } else if (kind === 'sourcing' || kind === 'storage') {
    const p = (kind === 'sourcing' ? SOURCING_PRESETS : STORAGE_PRESETS).find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
  } else if (kind === 'cover') {
    const p = COVER_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
  } else if (kind === 'mind') {
    const p = MIND_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
    Object.assign(mind, { hardware: p.hardware, software: p.software })
  } else {
    const p = UNIT_PRESETS.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
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
  if (kind === 'unit') return { kind, spec: { ...base, first } }
  if (kind === 'mind') return { kind, spec: { ...base, step: mind.step, hardware: mind.hardware, software: mind.software } }
  if (kind === 'create') return { kind, spec: { ...base, target: creationTarget.value } }
  if (kind === 'sourcing') return { kind, spec: { ...base, unitId: sourcing.unitId } }
  if (kind === 'storage') return { kind, spec: { ...base, resourceId: storage.resourceId } }
  if (kind === 'cover') return { kind, spec: base }
  return { kind: 'resource', spec: base }
})

const blocker = computed(() => {
  if (!name.value.trim()) return 'Name your idea.'
  const i = input.value
  if (i.kind === 'strategy') return precheckStrategy(game.state, i.spec)
  if (i.kind === 'unit') return precheckUnit(game.state, i.spec)
  if (i.kind === 'mind') return precheckMind(game.state, i.spec)
  if (i.kind === 'create') return precheckCreate(game.state, i.spec)
  if (i.kind === 'sourcing') return precheckSourcing(game.state, i.spec)
  if (i.kind === 'storage') return precheckStorage(game.state, i.spec)
  if (i.kind === 'cover') return precheckCover(game.state, i.spec)
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
// Jev's takes on the unit, each drafted as if picked, to show what it would cost.
const unitOptions = computed(() => {
  const v = verdict.value
  if (v?.kind !== 'unit') return []
  return v.options.map((o, i) => {
    const draft = draftUnit(game.state, { ...v, choice: i })
    return {
      i,
      tier: tierLabel(o.tier),
      worth: unitValueText(draft.unit.value),
      runsOn: findResource(game.state, o.upkeepId)?.name ?? '?',
      traits: o.traits,
      draft
    }
  })
})
const unitChoice = computed({
  get: () => (verdict.value?.kind === 'unit' ? verdict.value.choice : 0),
  set: (choice: number) => {
    if (verdict.value?.kind === 'unit') verdict.value.choice = choice
  }
})
const mindDraft = computed(() => (verdict.value?.kind === 'mind' ? draftMind(game.state, verdict.value) : null))
const mindOptions = computed(() => {
  const v = verdict.value
  if (v?.kind !== 'mind') return []
  return v.options.map((o, i) => ({ i, perk: computeTrait(o.perk), drawback: computeTrait(o.drawback) }))
})
const mindChoice = computed({
  get: () => (verdict.value?.kind === 'mind' ? verdict.value.choice : 0),
  set: (choice: number) => {
    if (verdict.value?.kind === 'mind') verdict.value.choice = choice
  }
})
// Cover previews next week, which structuredClones the state: it needs the raw state, not the proxy.
const coverDraft = computed(() => (verdict.value?.kind === 'cover' ? draftCover(toRaw(game.state), verdict.value) : null))
const coverBlock = computed(() => (verdict.value?.kind === 'cover' ? coverBlocker(toRaw(game.state), verdict.value) : null))
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
  if (v?.kind === 'unit' && first) return 'Add to industry'
  if (v?.kind === 'strategy' && strategyDraft.value?.minIQ) return 'Add as research'
  if (v?.kind === 'cover') return 'Use it now'
  if (v?.kind === 'create') return 'Do it'
  if (v?.kind === 'sourcing') return 'Sign it'
  if (v?.kind === 'unit' || v?.kind === 'mind' || v?.kind === 'storage') return 'Add as research'
  return 'Accept'
})

function onPick(key: string, value: string) {
  const v = verdict.value
  if (!v) return
  v.picks[key] = value
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
  // Back to the form that asked for this resource, if any. A first unit goes on to its first strategy.
  const made = first ? game.state.units.find((u) => u.name === name.value.trim()) : undefined
  if (props.request.then) ui.openInvent(props.request.then)
  else if (made) ui.openInvent({ kind: 'strategy', unitId: made.id })
  else ui.closeInvent()
  ui.notice = made ? { tone: 'good', text: `${made.name} is ready. Now give it something to do.` } : notice
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

.options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.option {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}

.option input {
  width: auto;
  margin-top: 3px;
}

.option.chosen {
  color: var(--text);
}

.option-traits {
  margin: 0 4px;
}

.option.blocked {
  opacity: 0.6;
  cursor: not-allowed;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}

.chip.bad {
  color: var(--bad);
  border-color: var(--bad);
}

.chip.good {
  color: var(--good);
  border-color: var(--good);
}
</style>
