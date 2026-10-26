import { computed, reactive, ref, toRaw, watch } from 'vue'
import { applyBlocker, isBankable } from '@/engine/banking'
import { computeTrait } from '@/engine/computeTraits'
import { coverBlocker, draftCover, precheckCover } from '@/engine/coverProposal'
import { precheckCreate } from '@/engine/createProposal'
import { draftMind, precheckMind } from '@/engine/mindProposal'
import { bestMind, capOf, describeCost, describeFlows, findResource, fmt, nextHardwareName, tierLabel, unitValueText } from '@/engine/model'
import {
  COVER_PRESETS,
  CREATE_PRESETS,
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
import { draftResource, precheckName } from '@/engine/proposals'
import { resourceTrait } from '@/engine/resourceTraits'
import { precheckSourcing } from '@/engine/sourcingProposal'
import { precheckStorage } from '@/engine/storageProposal'
import { draftStrategy, precheckStrategy } from '@/engine/strategyProposal'
import type { CreateTarget } from '@/engine/types'
import { draftUnit, precheckUnit } from '@/engine/unitProposal'
import { useGameStore, type ProposalInput, type Verdict } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import type { ProposalKind } from './copy'
import type { PresetItem } from './PresetCatalogue.vue'

/** Everything a proposal dialog does: the form, its presets, asking Jev, and taking an option. */
export function useProposal(request: InventRequest) {
  const game = useGameStore()
  const ui = useUiStore()
  const kind = request.kind as ProposalKind
  const first = kind === 'unit' && !!request.first

  const name = ref(request.name ?? '')
  const description = ref(request.description ?? '')
  const feedback = ref('')
  const verdict = ref<Verdict | null>(null)
  watch(verdict, (v) =>
    game.logTo('ui', v ? 'verdict_shown' : 'verdict_closed', { dialog: kind, plausibility: v?.plausibility, rejected: v?.rejected })
  )

  const strategy = reactive({
    unitId: request.unitId ?? game.state.units[0]?.id ?? '',
    outputId: request.outputId ?? game.state.resources[0]?.id ?? ''
  })
  const current = computed(() => bestMind(game.state))
  const creation = reactive({
    target: request.unitId ? `unit:${request.unitId}` : `resource:${request.outputId ?? game.state.resources[0]?.id ?? ''}`
  })
  const creationTarget = computed<CreateTarget>(() => {
    const [k, ...id] = creation.target.split(':')
    return { kind: k === 'unit' ? 'unit' : 'resource', id: id.join(':') }
  })
  const sourcing = reactive({ unitId: request.unitId ?? game.state.units[0]?.id ?? '' })
  const storage = reactive({ resourceId: request.resourceId ?? game.state.resources[0]?.id ?? '' })

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
    const fill = (p: { name: string; description: string } | undefined) => {
      if (!p) return false
      name.value = p.name
      description.value = p.description
      return true
    }
    if (kind === 'resource') fill(RESOURCE_PRESETS.find((x) => x.name === presetId))
    else if (kind === 'strategy') {
      const p = STRATEGY_PRESETS.find((x) => x.name === presetId)
      if (!fill(p) || !p) return
      const runner = runnerFor(game.state, p)
      if (runner) strategy.unitId = runner.id
      const output = resolveResources(game.state, [p.output])
      if (output.ids[0]) strategy.outputId = output.ids[0]
      missingResources.value = output.missing
    } else if (kind === 'create') {
      const p = CREATE_PRESETS.find((x) => x.name === presetId)
      if (!fill(p) || !p) return
      const output = resolveResources(game.state, [p.output])
      if (output.ids[0]) creation.target = `resource:${output.ids[0]}`
      missingResources.value = output.missing
    } else if (kind === 'sourcing') fill(SOURCING_PRESETS.find((x) => x.name === presetId))
    else if (kind === 'storage') fill(STORAGE_PRESETS.find((x) => x.name === presetId))
    else if (kind === 'cover') fill(COVER_PRESETS.find((x) => x.name === presetId))
    else if (kind === 'mind') fill(mindPresets.value.find((x) => x.name === presetId))
    else fill(UNIT_PRESETS.find((x) => x.name === presetId))
  }

  /** Opens the resource form for a missing resource, then comes back here with the same preset. */
  function introduce(resourceName: string) {
    const preset = RESOURCE_PRESETS.find((r) => r.name === resourceName)
    ui.openInvent({
      kind: 'resource',
      name: resourceName,
      description: preset?.description ?? '',
      preset: preset?.name,
      then: { ...request, preset: presetName.value }
    })
  }

  if (request.preset) applyPreset(request.preset)

  // ---------------------------------------------------------------- asking Jev

  const input = computed<ProposalInput>(() => {
    const base = { name: name.value, description: description.value }
    if (kind === 'strategy') return { kind, spec: { ...base, unitId: strategy.unitId, outputId: strategy.outputId } }
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

  // ---------------------------------------------------------------- Jev's options, drafted

  /** A computed `choice` on the verdict, for kinds that pick one option. */
  const choiceOf = (k: Verdict['kind']) =>
    computed({
      get: () => (verdict.value?.kind === k && 'choice' in verdict.value ? (verdict.value.choice as number) : 0),
      set: (choice: number) => {
        if (verdict.value?.kind === k && 'choice' in verdict.value) (verdict.value as { choice: number }).choice = choice
      }
    })

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
        uses: draft.strategy.inputs.length ? describeFlows(game.state, draft.strategy.inputs) : 'nothing',
        made,
        draft
      }
    })
  })
  /** What the resource being expanded holds now. */
  const storageTotal = computed(() => {
    const v = verdict.value
    const r = v?.kind === 'storage' ? findResource(game.state, v.spec.resourceId) : undefined
    return r ? capOf(game.state, r) : 0
  })
  const researchText = (d: { minIQ: number; cost: Parameters<typeof describeCost>[1] }) =>
    `Research: needs IQ ${d.minIQ}, uses up ${d.cost.length ? describeCost(game.state, d.cost) : 'nothing'}.`

  const acceptLabel = computed(() => {
    const v = verdict.value
    // These show their options as cards, each with its own button.
    if (v && ['create', 'sourcing', 'storage', 'mind', 'unit', 'strategy'].includes(v.kind)) return null
    if (v?.kind === 'resource' && resourceOptions.value.length) return null
    if (v?.kind === 'cover') return 'Use it now'
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

  // ---------------------------------------------------------------- taking it

  function finish(notice: NonNullable<typeof ui.notice>) {
    if (request.then) ui.openInvent(request.then)
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

  function onPick(key: string, value: string) {
    if (verdict.value) verdict.value.picks[key] = value
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
    if (request.then) ui.openInvent(request.then)
    else if (made) ui.openInvent({ kind: 'strategy', unitId: made.id })
    else ui.closeInvent()
    ui.notice = made ? { tone: 'good', text: `${made.name} is ready. Now give it something to do.` } : notice
  }

  /** A card's own button for options that aren't research: pick it, then take it. */
  function pickAndAccept(pick: () => unknown) {
    pick()
    accept()
  }

  return {
    kind,
    first,
    name,
    description,
    feedback,
    verdict,
    strategy,
    current,
    creation,
    sourcing,
    storage,
    presetName,
    presetItems,
    missingResources,
    applyPreset,
    introduce,
    blocker,
    submit,
    resourceDraft,
    strategyDraft,
    unitDraft,
    unitOptions,
    mindOptions,
    resourceOptions,
    strategyOptions,
    coverDraft,
    coverBlock,
    storageTotal,
    researchText,
    acceptLabel,
    bankable,
    blockers,
    saveForLater,
    applyNow,
    onPick,
    accept,
    pickAndAccept,
    resourceChoice: choiceOf('resource'),
    unitChoice: choiceOf('unit'),
    mindChoice: choiceOf('mind'),
    strategyChoice: choiceOf('strategy')
  }
}
