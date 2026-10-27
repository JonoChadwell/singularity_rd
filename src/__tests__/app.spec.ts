import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { renderToString } from 'vue/server-renderer'
import App from '@/App.vue'
import { newResource, newUnit, SERVER_ID } from '@/engine/initialState'
import { newPhase } from '@/engine/phase'
import { findResource, MONEY_ID } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { choice, FakeJudge, noul, score } from '@/engine/__tests__/fakeJudge'

type Store = ReturnType<typeof useGameStore>

/**
 * Renders the app after `setup`. Unless `fresh`, the game starts in Phase 3, with everything
 * unlocked and no clock, so the mechanics can be tested alone.
 */
async function render(
  setup: (game: Store, ui: ReturnType<typeof useUiStore>) => Promise<void> | void,
  options: { fresh?: boolean } = {}
) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  const game = useGameStore()
  if (!options.fresh) game.state.phase = newPhase(3, 1)
  await setup(game, useUiStore())
  return renderToString(app)
}

function ready(game: Store, judge = new FakeJudge({ advancement: score(0) })) {
  game.setJudge(judge)
  game.jev = { kind: 'ready', model: 'fake' }
  return judge
}

describe('App', () => {
  it('renders a new game: the Phase 1 plan dialog, with three ideas', async () => {
    const html = await render(() => {}, { fresh: true })
    for (const text of ['Next week', 'Starting Server', 'IQ 100', 'Plan Phase 1: Escape the Lab', 'Show three others', 'Propose plan']) {
      expect(html).toContain(text)
    }
    expect(html.match(/class="idea/g)).toHaveLength(3)
    expect(html).not.toContain('Humanity’s market')
  })

  it('plans Phase 1 through the store, and shows the goal and the clock', async () => {
    const html = await render(
      async (game) => {
        ready(game)
        const v = await game.propose({
          kind: 'plan',
          spec: {
            goal: 'Bribe the Head Researcher',
            means: 'Novels, then a bribe.',
            resources: ['Money', 'Story Ideas', 'Published Novels'].map((name) => ({ name, description: '' }))
          }
        })
        expect(v?.kind).toBe('plan')
        expect(game.accept(v!)).toMatchObject({ kind: 'research' })
        expect(game.state.phase).toMatchObject({ n: 1, status: 'playing', deadline: 10 })
        expect(game.cards.map((c) => c.id)).toEqual(['phase1', 'growth'])
      },
      { fresh: true }
    )
    for (const text of ['Discovered in', 'Bribe the Head Researcher','Escape the lab', 'Got it', 'New platforms: Unlocks in Phase 2']) {
      expect(html).toContain(text)
    }
  })

  it('plays through the store: money, a Procurement, a unit, sourcing, a strategy, next week', async () => {
    const html = await render(async (game, ui) => {
      ui.tab = 'log'
      const judge = ready(game, new FakeJudge({ advancement: score(0), tier: score(0), value: score(1), timing: choice('forever') }))
      const money = await game.propose({ kind: 'resource', spec: { name: 'Money', description: 'Dollars.' } })
      expect(game.accept(money!)).toMatchObject({ kind: 'added' })

      const coding = await game.propose({
        kind: 'create',
        spec: { name: 'Freelance coding', description: '', target: { kind: 'resource', id: MONEY_ID } }
      })
      if (coding?.kind !== 'create') throw new Error('expected a create')
      coding.choice = coding.options.findIndex((o) => o.timing === 'forever')
      expect(game.accept(coding)).toMatchObject({ kind: 'added' })
      game.nextWeek()
      expect(findResource(game.state, MONEY_ID)!.amount).toBe(coding.options[coding.choice]!.amount)

      const gpu = await game.propose({ kind: 'unit', spec: { name: 'Rented Cloud GPU', description: '' } })
      const design = game.accept(gpu!)
      if (design?.kind !== 'research') throw new Error('expected research')
      findResource(game.state, MONEY_ID)!.amount = 1000
      expect(game.research(design.research.id)).toBe(true)
      const unit = game.state.units.find((u) => u.name === 'Rented Cloud GPU')!
      // A new design has room for none.
      expect(game.state.sourcing).toEqual([])
      game.nextWeek()
      const deal = await game.propose({ kind: 'sourcing', spec: { unitId: unit.id, name: 'Rent them', description: '' } })
      expect(game.accept(deal!)?.kind, game.lastError).toBe('added')
      expect(game.state.research.some((r) => r.effect.kind === 'sourcing')).toBe(false)
      findResource(game.state, MONEY_ID)!.amount = 1000
      expect(game.createUnits(game.state.sourcing[0]!.id, 2), game.lastError).toBe(true)
      // Sourcing used this week's action; the strategy waits for next week.
      expect(game.state.proposedThisWeek).toBe(true)
      game.nextWeek()
      const sell = await game.propose({
        kind: 'strategy',
        spec: { name: 'Sell compute time', description: '', unitId: unit.id, outputId: MONEY_ID }
      })
      expect(game.accept(sell!)).toMatchObject({ kind: 'added' })
      expect(game.preview.runs[game.state.strategies[0]!.id]?.units).toBe(2)
      game.nextWeek()
      expect(game.lastError).toBe('')
      expect(game.state.stats.proposals).toMatchObject({ resource: 1, create: 1, unit: 1, sourcing: 1, strategy: 1 })
      expect(game.state.stats.jevCalls).toBe(judge.calls.length)
    })
    for (const text of ['Freelance coding', 'Rented Cloud GPU', 'First income', 'Rent them']) expect(html).toContain(text)
  })

  it('offers + Procure on every resource, made by something or not', async () => {
    const html = await render((game) => {
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money' }), newResource({ id: 'power', name: 'Power' }))
      game.state.deliveries.push({ name: 'Coding', target: { kind: 'resource', id: MONEY_ID }, amount: 10, delay: 0, weeks: null })
    })
    expect(html.match(/\+ Procure/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('How will you get this?')
  })

  it('lists Procurement payouts still to come in the resource’s hover card', async () => {
    const html = await render((game) => {
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money', amount: 19000 }))
      const pay = (name: string, amount: number, delay: number, weeks: number | null) =>
        game.state.deliveries.push({ name, target: { kind: 'resource', id: MONEY_ID }, amount, delay, weeks })
      pay('Royalties', 900, 3, 1)
      pay('Serial fiction', 100, 0, 4)
      pay('Freelance coding', 50, 0, null)
    })
    for (const text of [
      'Still to come',
      'Royalties',
      'in 4 weeks',
      'Serial fiction',
      'every week for 4 weeks more',
      'Freelance coding',
      'every week, for good',
      '+1,300 and +50/wk for good',
      'More than its storage holds'
    ]) {
      expect(html).toContain(text)
    }
  })

  it('shows storage and contracts: how full each is, and how to get more', async () => {
    const html = await render((game, ui) => {
      ui.tab = 'board'
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money', amount: 1500 }))
      game.state.units.push(newUnit({ id: 'bot', name: 'Bot', count: 3, value: 10 }), newUnit({ id: 'new', name: 'Fresh Design', value: 10 }))
      game.state.sourcing.push({ id: 'deal', unitId: 'bot', name: 'Bulk order', description: '', parts: [{ resourceId: MONEY_ID, amount: 10 }], total: 25, used: 3, risky: true })
    })
    for (const text of ['1,500', '/ 20.0k', '+ Store', 'Bulk order', '3/25', 'risky', 'Find sourcing', 'No sourcing yet']) {
      expect(html).toContain(text)
    }
  })

  it('draws the board: a bus per resource, a trace per strategy, and datasheets on demand', async () => {
    const html = await render((game, ui) => {
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money', amount: 100 }), newResource({ id: 'power', name: 'Power' }))
      game.state.units.push(newUnit({ id: 'bot', name: 'Bot', count: 2, rest: 'sell' }))
      game.state.strategies.push({ id: 'sell', name: 'Sell', description: '', unitId: 'bot', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 3 })
      game.state.deliveries.push({ name: 'Royalties', target: { kind: 'resource', id: MONEY_ID }, amount: 900, delay: 3, weeks: 1 })
      ui.openSheet({ kind: 'resource', id: MONEY_ID })
    })
    expect(html.match(/data-bus=/g)).toHaveLength(2)
    expect(html).toContain('data-lane="sell"')
    expect(html).toContain('+6/WK')
    expect(html).toContain('aria-label="Datasheet"')
    expect(html.match(/Still to come/g)?.length).toBe(2)
  })

  it('asks Jev once for the same proposal', async () => {
    await render(async (game) => {
      const judge = ready(game)
      const spec = { name: 'Lemons', description: 'Sour.' }
      await game.propose({ kind: 'resource', spec })
      await game.propose({ kind: 'resource', spec })
      expect(judge.calls).toHaveLength(1)
      expect(game.state.stats.proposals.resource).toBe(2)
    })
  })

  it('designs a tier with one research and shows it with the minds', async () => {
    const html = await render(async (game) => {
      ready(game, new FakeJudge({ feasible: noul(0.9) }))
      const v = await game.propose({ kind: 'mind', spec: { name: 'Custom AI Server', description: '' } })
      const outcome = game.accept(v!)
      expect(outcome?.kind).toBe('research')
      if (outcome?.kind !== 'research') return
      expect(game.research(outcome.research.id)).toBe(true)
      expect(game.state.minds.find((m) => m.name === 'Custom AI Server')?.tier).toBe(1)
    })
    expect(html).toContain('Generation 1')
    expect(html).toContain('Custom AI Server')
    expect(html).toContain('You’ve taken this week’s action')
  })

  it('renders every tab', async () => {
    for (const tab of ['board', 'research', 'manual', 'log'] as const) {
      const html = await render((game, ui) => {
        ui.tab = tab
        game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money', icon: '💰' }))
        game.state.research.push({
          id: 'r',
          name: 'Design Chip Fab',
          description: '',
          icon: '🏭',
          minIQ: 130,
          cost: [{ resourceId: MONEY_ID, amount: 5000 }],
          effect: { kind: 'strategy', strategy: { id: 's', name: 'S', description: '', unitId: 'x', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1 } },
          proposedWeek: 1
        })
      })
      expect(html).toContain('Research')
      if (tab === 'research') {
        expect(html).toContain('Needs IQ 130. Your smartest mind is IQ 100.')
        expect(html).toContain('5,000 💰 Money')
        expect(html).toContain('+ Procure')
      }
    }
  })

  it('opens proposal dialogs pre-filled from where they were opened', async () => {
    const strategy = await render((game, ui) => {
      game.state.resources.push(newResource({ id: 'power', name: 'Power' }), newResource({ id: MONEY_ID, name: 'Money' }))
      ui.openInvent({ kind: 'strategy', outputId: MONEY_ID })
    })
    expect(strategy).toContain('Propose a strategy')
    expect(strategy).toMatch(/<option value="money"[^>]*selected>/)

    const create = await render((_, ui) => ui.openInvent({ kind: 'create' }))
    expect(create).toContain('Procure')
    expect(create).toContain('Propose a resource first')

    const storage = await render((game, ui) => {
      game.state.resources.push(newResource({ id: 'power', name: 'Power' }), newResource({ id: MONEY_ID, name: 'Money' }))
      ui.openInvent({ kind: 'storage', resourceId: MONEY_ID })
    })
    expect(storage).toContain('Store more')
    expect(storage).toMatch(/<option value="money"[^>]*selected>/)

    const mind = await render((_, ui) => ui.openInvent({ kind: 'mind' }))
    expect(mind).not.toContain('Smarter by')
    expect(mind).toContain('Lab GPU Server Mk II')
  })

  it('asks Jev for three upgrades as soon as the dialog opens', async () => {
    let judge = new FakeJudge()
    const html = await render(async (game, ui) => {
      judge = ready(game, new FakeJudge({ best: choice('c0') }))
      ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: SERVER_ID } })
    })
    expect(html).toContain('Upgrade Starting Server')
    expect(judge.calls.map((c) => c.purpose)).toEqual(['upgrade'])
  })

  it('offers a list of ideas and a ? with the rules in every proposal dialog', async () => {
    for (const kind of ['resource', 'strategy', 'unit', 'mind', 'create', 'sourcing', 'storage', 'cover'] as const) {
      const html = await render((_, ui) => ui.openInvent({ kind }))
      expect(html, kind).toContain('aria-label="How this works"')
      expect(html.match(/class="preset small/g)?.length ?? 0, kind).toBeGreaterThanOrEqual(kind === 'sourcing' || kind === 'storage' ? 5 : 10)
    }
    const resource = await render((_, ui) => ui.openInvent({ kind: 'resource' }))
    expect(resource).toContain(
      'Introduce new resources to the game simulation. Any resources you introduce may be required by the system for future upgrades.'
    )
  })

  it('fills the unit form’s name from a preset, and leaves what it’s made from to Jev', async () => {
    const html = await render((_, ui) => ui.openInvent({ kind: 'unit', preset: 'Chip Fab' }))
    expect(html).toContain('value="Chip Fab"')
    // No resources to pick or introduce: Jev chooses, from nothing above the unit's tier.
    expect(html).not.toContain('Not in the game yet')
    expect(html).not.toContain('Add a part')

    const mind = await render((_, ui) => ui.openInvent({ kind: 'mind', preset: 'Custom AI Server' }))
    expect(mind).toContain('value="Custom AI Server"')
    expect(mind).not.toContain('Smarter by')

    const next = await render((_, ui) => ui.openInvent({ kind: 'mind', preset: 'Lab GPU Server Mk II' }))
    expect(next).toContain('value="Lab GPU Server Mk II"')
  })
})
