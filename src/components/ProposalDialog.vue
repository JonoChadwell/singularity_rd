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
        <label class="field">
          <span>Makes</span>
          <select v-model="strategy.outputId">
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
        </label>
        <p class="muted small note">
          Don’t see what it makes? <button type="button" class="link" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
        </p>
        <p class="muted small note">
          Jev offers three ways, each using up different resources. Simple things (tier 0 and 1) can use nothing at all,
          tier 2 needs at least one resource, and tier 3 and up need two different ones.
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
        <p v-if="current" class="muted small note">
          It replaces {{ current.name }} for good, even a “Mk II”: nothing carries over. Jev offers three takes, each a
          perk and drawback at its own size, paid for in its own resource.
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
      :save-label="bankable ? 'Save For Later' : undefined"
      @pick="onPick"
      @accept="accept"
      @save="saveForLater"
      @edit="verdict = null"
    >
      <div v-if="verdict.kind === 'resource' && resourceDraft" class="outcome small">
        <div class="muted">{{ tierText(resourceDraft) }} · one is worth: {{ bandText(resourceDraft) }}</div>
        <div class="muted">Storage holds {{ fmt(resourceDraft.cap) }} to start.</div>
        <div v-if="resourceOptions.length" class="small">
          <p class="muted cards-legend">Its nature: pick one. Every trait has an upside and a downside.</p>
          <div class="cards">
            <OptionCard v-for="o in resourceOptions" :key="o.i" :chosen="resourceChoice === o.i" @select="resourceChoice = o.i">
              <div v-for="t in o.traits" :key="t.id">
                <strong>{{ t.icon }} {{ t.name }}</strong>
                <div class="good">{{ t.upside }}</div>
                <div class="warn">{{ t.downside }}</div>
              </div>
              <template #actions>
                <button type="button" class="small primary" :disabled="game.busy" @click="pickAndAccept(() => (resourceChoice = o.i))">Add it</button>
              </template>
            </OptionCard>
          </div>
        </div>
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
        <p class="muted cards-legend">Jev’s offers: pick one. It uses this week’s action.</p>
        <div class="cards">
          <OptionCard
            v-for="(o, i) in verdict.options"
            :key="i"
            :chosen="verdict.choice === i"
            :blocked="!!optionBlocker(game.state, o)"
            @select="verdict.choice = i"
          >
            <strong>{{ describeOption(game.state, verdict, o) }}</strong>
            <span class="muted">uses {{ o.inputs.length ? describeFlows(game.state, o.inputs) : 'nothing' }}</span>
            <span v-if="optionBlocker(game.state, o)" class="bad">{{ optionBlocker(game.state, o) }}</span>
            <span v-else-if="overflowOf(game.state, verdict, o)" class="warn">
              {{ fmt(overflowOf(game.state, verdict, o)) }} won’t fit in storage
            </span>
            <template #actions>
              <button
                type="button"
                class="small primary"
                :disabled="game.busy || !!optionBlocker(game.state, o)"
                @click="verdict.choice = i; accept()"
              >
                Do it
              </button>
            </template>
          </OptionCard>
        </div>
        <div v-if="verdict.risk" class="warn">{{ riskText(verdict.risk, 'strategy') }}</div>
      </div>
      <div v-else-if="verdict.kind === 'sourcing'" class="outcome small">
        <p class="muted cards-legend">Contracts: pick one</p>
        <div class="cards">
          <OptionCard v-for="(o, i) in verdict.options" :key="i" :chosen="verdict.choice === i" @select="verdict.choice = i">
            <div>
              <strong>{{ o.label }}</strong>: up to {{ fmt(o.total) }}
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
            </div>
            <div class="muted">Each takes {{ describeFlows(game.state, o.parts) }}.</div>
            <div :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</div>
            <template #actions>
              <ApplyButtons :blocker="blockers[i] ?? null" @apply="applyNow(i)" />
            </template>
          </OptionCard>
        </div>
      </div>
      <div v-else-if="verdict.kind === 'storage'" class="outcome small">
        <div class="chips">
          <span class="chip" title="How many Jev thinks could exist in this phase">🌍 Can exist: ~{{ verdict.scalars.ceilingLabel }}</span>
          <span class="chip" :title="`${verdict.scalars.reachLabel}. At your IQ: ${verdict.scalars.holderLabel.toLowerCase()}.`">
            🏭 You could build: ~{{ fmt(verdict.scalars.reach) }}
          </span>
          <span class="chip" title="How much of that this way captures">⚙️ This way: {{ verdict.scalars.captureLabel }}</span>
        </div>
        <p class="muted cards-legend">Expansions: pick one</p>
        <div class="cards">
          <OptionCard v-for="(o, i) in verdict.options" :key="i" :chosen="verdict.choice === i" @select="verdict.choice = i">
            <div>
              <strong>{{ o.label }}</strong>: room for {{ fmt(o.added) }} more ({{ fmt(storageTotal + o.added) }} in all)
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
            </div>
            <div v-if="o.advanced" class="warn">
              Ahead of you: needs IQ {{ o.advanced }} ({{ lower(verdict.scalars.techLabel) }}), +{{ Math.round((STORAGE_ADVANCED_BONUS - 1) * 100) }}% for thinking ahead.
              Costs {{ describeCost(game.state, o.cost) }}.
            </div>
            <div v-else class="muted">{{ researchText(o) }}</div>
            <div :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</div>
            <div v-if="o.limitedBy" class="warn">Capped: no more than ~{{ verdict.scalars.ceilingLabel }} can exist yet.</div>
            <template #actions>
              <ApplyButtons :blocker="blockers[i] ?? null" @apply="applyNow(i)" />
            </template>
          </OptionCard>
        </div>
      </div>
      <div v-else-if="verdict.kind === 'strategy' && strategyDraft" class="outcome small">
        <p class="muted cards-legend">Ways to do it: pick one</p>
        <div class="cards">
          <OptionCard v-for="o in strategyOptions" :key="o.i" :chosen="strategyChoice === o.i" @select="strategyChoice = o.i">
            <div>
              <strong>{{ o.title }}</strong>
            </div>
            <div>{{ o.text }} each, every week.</div>
            <StrategyTags :strategy="o.draft.strategy" />
            <template #actions>
              <ApplyButtons :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </OptionCard>
        </div>
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
        <p class="muted small cards-legend">Jev’s takes: pick one</p>
        <div class="cards">
          <OptionCard v-for="o in unitOptions" :key="o.i" :chosen="unitChoice === o.i" @select="unitChoice = o.i">
            <div><strong>{{ o.tier }}</strong></div>
            <div>One is worth: {{ o.worth }}</div>
            <div class="muted">Runs on {{ o.runsOn }}</div>
            <TraitChips v-if="o.traits.length" :traits="o.traits" />
            <span v-else class="muted">No traits</span>
            <div v-if="!first" class="muted">{{ researchText(o.draft) }}</div>
            <template #actions>
              <button v-if="first" type="button" class="small primary" :disabled="game.busy" @click="pickAndAccept(() => (unitChoice = o.i))">
                Add to industry
              </button>
              <ApplyButtons v-else :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </OptionCard>
        </div>
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
      <div v-else-if="verdict.kind === 'mind' && mindOptions.length" class="outcome small">
        <p class="muted small cards-legend">Jev’s takes: pick one. It replaces your platform for good.</p>
        <div class="cards">
          <OptionCard v-for="o in mindOptions" :key="o.i" :chosen="mindChoice === o.i" @select="mindChoice = o.i">
            <div>
              <strong>{{ o.step ? '+' + o.step + ' IQ' : 'Same IQ' }}</strong> → IQ {{ o.draft.mind.hardware.iq }}
            </div>
            <div class="good" :title="o.perk.rule">{{ o.perk.icon }} {{ o.perk.name }}</div>
            <div class="muted">{{ o.perk.rule }}</div>
            <div class="warn" :title="o.drawback.rule">{{ o.drawback.icon }} {{ o.drawback.name }}</div>
            <div class="muted">{{ o.drawback.rule }}</div>
            <div class="muted">{{ researchText(o.draft) }}</div>
            <template #actions>
              <ApplyButtons :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </OptionCard>
        </div>
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { STORAGE_ADVANCED_BONUS } from '@/engine/balance'
import { computeTrait } from '@/engine/computeTraits'
import { resourceTrait } from '@/engine/resourceTraits'
import { describeOption, optionBlocker, overflowOf, precheckCreate } from '@/engine/createProposal'
import { applyBlocker, isBankable } from '@/engine/banking'
import { coverBlocker, draftCover, precheckCover } from '@/engine/coverProposal'
import { draftMind, precheckMind } from '@/engine/mindProposal'
import {
  bandText,
  bestMind,
  byTier,
  capOf,
  describeCost,
  describeFlows,
  findResource,
  fmt,
  nextHardwareName,
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
import { precheckStorage } from '@/engine/storageProposal'
import type { CreateTarget } from '@/engine/types'
import { DESCRIPTION_MAX, draftResource, NAME_MAX, precheckName } from '@/engine/proposals'
import { draftStrategy, precheckStrategy } from '@/engine/strategyProposal'
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
import ApplyButtons from './ApplyButtons.vue'
import OptionCard from './OptionCard.vue'

const props = defineProps<{ request: InventRequest }>()
type Kind = 'resource' | 'strategy' | 'unit' | 'mind' | 'create' | 'sourcing' | 'storage' | 'cover'

const COPY: Record<
  Kind,
  { title: string; help: string; presets: string; name: string; description: string; cost: string }
> = {
  resource: {
    title: 'Propose a resource',
    help: 'Introduce new resources to the game simulation. Any resources you introduce may be required by the system for future upgrades. Every resource has a nature: one or two traits, each with an upside and a downside. Jev offers three to pick from.',
    presets: 'Pick one, or name your own:',
    name: 'e.g. Power, Silicon, Lemons',
    description: 'What is it? (optional)',
    cost: 'Added at once, if Jev agrees it’s a thing.'
  },
  strategy: {
    title: 'Propose a strategy',
    help: 'A strategy is something an industry unit does every week, turning up to two inputs into one output. Pick one from the list or write your own, and say who runs it and what it makes. Jev judges whether the unit could do it and offers three ways, each using up different resources: simple things (tier 0 and 1) can use nothing, tier 2 needs at least one resource, tier 3 and up need two different ones. Apply one now, or save all three to Research for one action. Simple strategies are ready at once, and advanced ones become research.',
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
    help: 'An intelligence system is one machine that thinks: a hardware platform running software. A new one is up to 100 IQ smarter than your best and replaces the old one for good. Jev offers three perk-and-drawback pairs, and you pick one. A software upgrade adds IQ over the hardware; you can redo it at full cost (it replaces the last one, not adds to it). The smartest platforms are paid for in a resource your units make. Your smartest mind sets which research you can do.',
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
    help: 'Cover buys time: it moves the day your plan fails further away, the moment you use it, so you need its IQ and its cost when you accept. Jev judges how plausible and how convincing it is. More convincing cover adds more weeks but needs more IQ. Each cover you’ve already used makes the next one add 30% less. It costs some weeks of your current output. Cover is never risky. It uses the week’s one action.',
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
  outputId: props.request.outputId ?? game.state.resources[0]?.id ?? ''
})

const current = computed(() => bestMind(game.state))
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

/** The current platform's next generation comes first, then the ready-made ideas. */
const mindPresets = computed(() => {
  const m = current.value
  const next = m ? [{ name: nextHardwareName(m.hardware.name), description: `The next generation of ${m.hardware.name}.` }] : []
  return [...next, ...MIND_PRESETS]
})

const presetItems = computed<PresetItem[]>(() => {
  const blocked = (n: string) => (taken(game.state, n) ? 'Already in the game.' : null)
  if (kind === 'resource') return RESOURCE_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'strategy') return STRATEGY_PRESETS.map((p) => ({ ...p, blocked: blocked(p.name) }))
  if (kind === 'create') return CREATE_PRESETS.map((p) => ({ ...p, icon: '⚗️', blocked: null }))
  if (kind === 'sourcing') return SOURCING_PRESETS.map((p) => ({ ...p, icon: '📦', blocked: null }))
  if (kind === 'storage') return STORAGE_PRESETS.map((p) => ({ ...p, icon: '🏗️', blocked: null }))
  if (kind === 'cover') return COVER_PRESETS.map((p) => ({ ...p, icon: '🕶️', blocked: blocked(p.name) }))
  if (kind === 'mind') return mindPresets.value.map((p) => ({ ...p, icon: '🧠', blocked: blocked(p.name) }))
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
    const output = resolveResources(game.state, [p.output])
    if (output.ids[0]) strategy.outputId = output.ids[0]
    missingResources.value = output.missing
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
    const p = mindPresets.value.find((x) => x.name === presetId)
    if (!p) return
    name.value = p.name
    description.value = p.description
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
    return { kind, spec: { ...base, unitId: strategy.unitId, outputId: strategy.outputId } }
  }
  if (kind === 'unit') return { kind, spec: { ...base, first } }
  if (kind === 'mind') return { kind, spec: base }
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
// Jev's takes on the new platform, each drafted as if picked, to show its size and what it would cost.
const mindOptions = computed(() => {
  const v = verdict.value
  if (v?.kind !== 'mind') return []
  return v.options.map((o, i) => ({
    i,
    step: o.step,
    perk: computeTrait(o.perk),
    drawback: computeTrait(o.drawback),
    draft: draftMind(game.state, { ...v, choice: i })
  }))
})
const resourceOptions = computed(() => {
  const v = verdict.value
  if (v?.kind !== 'resource') return []
  return v.options.map((ids, i) => ({ i, traits: ids.map(resourceTrait) }))
})
const resourceChoice = computed({
  get: () => (verdict.value?.kind === 'resource' ? verdict.value.choice : 0),
  set: (choice: number) => {
    if (verdict.value?.kind === 'resource') verdict.value.choice = choice
  }
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
// Jev's ways to do it, each drafted as if picked, to show what it uses and makes.
const strategyOptions = computed(() => {
  const v = verdict.value
  if (v?.kind !== 'strategy') return []
  return v.options.map((o, i) => {
    const draft = draftStrategy(game.state, { ...v, choice: i })
    const out = findResource(game.state, draft.strategy.outputId)
    const made = `${fmt(draft.strategy.amount)} ${out?.icon ?? ''} ${out?.name ?? ''}`
    const names = o.inputIds.map((id) => findResource(game.state, id)?.name ?? '?')
    return {
      i,
      title: names.length ? `Uses ${names.join(' and ')}` : 'No inputs',
      text: draft.strategy.inputs.length ? `${describeFlows(game.state, draft.strategy.inputs)} → ${made}` : made,
      draft
    }
  })
})
const strategyChoice = computed({
  get: () => (verdict.value?.kind === 'strategy' ? verdict.value.choice : 0),
  set: (choice: number) => {
    if (verdict.value?.kind === 'strategy') verdict.value.choice = choice
  }
})
/** What the resource being expanded holds now. */
const storageTotal = computed(() => {
  const v = verdict.value
  const r = v?.kind === 'storage' ? findResource(game.state, v.spec.resourceId) : undefined
  return r ? capOf(game.state, r) : 0
})
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const researchText = (d: { minIQ: number; cost: Parameters<typeof describeCost>[1] }) =>
  `Research: needs IQ ${d.minIQ}, uses up ${d.cost.length ? describeCost(game.state, d.cost) : 'nothing'}.`

const acceptLabel = computed(() => {
  const v = verdict.value
  // These show their options as cards, each with its own button.
  if (v && ['create', 'sourcing', 'storage', 'mind', 'unit', 'strategy'].includes(v.kind)) return null
  if (v?.kind === 'resource' && resourceOptions.value.length) return null
  if (v?.kind === 'unit' && first) return 'Add to industry'
  if (v?.kind === 'cover') return 'Use it now'
  if (v?.kind === 'create') return 'Do it'
  if (v?.kind === 'sourcing') return 'Sign it'
  if (v?.kind === 'unit' || v?.kind === 'mind' || v?.kind === 'storage') return 'Add as research'
  return 'Accept'
})

/** Whether Jev's options can be banked as research. */
const bankable = computed(() => {
  const v = verdict.value
  return !!v && isBankable(v) && !v.rejected && !v.duplicateOf
})
/** Why each option can't be applied now, or null: the buttons grey out on it. */
const blockers = computed<(string | null)[]>(() => {
  const v = verdict.value
  if (!v || !isBankable(v) || v.rejected || v.duplicateOf) return []
  const plain = JSON.parse(JSON.stringify(v)) as typeof v
  return plain.options.map((_, i) => applyBlocker(toRaw(game.state), plain, i))
})

function finish(notice: NonNullable<typeof ui.notice>) {
  if (props.request.then) ui.openInvent(props.request.then)
  else ui.closeInvent()
  ui.notice = notice
}

function saveForLater() {
  const v = verdict.value
  if (!v || !isBankable(v)) return
  if (!game.bank(v)) {
    feedback.value = game.lastError
    return
  }
  const n = v.options.length
  finish({ tone: 'good', text: `Saved ${n} option${n === 1 ? '' : 's'} to Research.` })
}

function applyNow(i: number) {
  const v = verdict.value
  if (!v || !isBankable(v)) return
  const outcome = game.bank(v, i, true)
  if (!outcome) {
    feedback.value = game.lastError
    return
  }
  finish({ tone: 'good', text: outcome.kind === 'added' ? `${outcome.name} is done.` : 'Done.' })
}

/** A card's own button for options that aren't research: pick it, then take it. */
function pickAndAccept(pick: () => unknown) {
  pick()
  accept()
}

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
  width: min(900px, calc(100vw - 32px));
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
