import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { renderToString } from 'vue/server-renderer'
import App from '@/App.vue'
import { newResource, newUnit, SERVER_ID } from '@/engine/initialState'
import { findResource, MONEY_ID } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { choice, FakeJudge, noul, score } from '@/engine/__tests__/fakeJudge'

type Store = ReturnType<typeof useGameStore>

async function render(setup: (game: Store, ui: ReturnType<typeof useUiStore>) => Promise<void> | void) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  const game = useGameStore()
  await setup(game, useUiStore())
  return renderToString(app)
}

function ready(game: Store, judge = new FakeJudge({ advancement: score(0) })) {
  game.setJudge(judge)
  game.jev = { kind: 'ready', model: 'fake' }
  return judge
}

describe('App', () => {
  it('renders a new game', async () => {
    const html = await render(() => {})
    for (const text of ['Next week', 'Starting Server', 'IQ 100', 'Nothing brings anything in yet', 'Week']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('Humanity’s market')
  })

  it('plays through the store: money, income, a unit, a strategy, next week', async () => {
    const html = await render(async (game) => {
      const judge = ready(game, new FakeJudge({ advancement: score(0), difficulty: score(0), value: score(1) }))
      const money = await game.propose({ kind: 'resource', spec: { name: 'Money', description: 'Dollars.' } })
      expect(game.accept(money!)).toMatchObject({ kind: 'added' })

      const coding = await game.propose({
        kind: 'income',
        spec: { name: 'Freelance coding', description: '', outputId: MONEY_ID }
      })
      const income = game.accept(coding!)
      expect(income?.kind).toBe('research')
      if (income?.kind !== 'research') return
      expect(game.research(income.research.id)).toBe(true)
      game.nextWeek()
      expect(findResource(game.state, MONEY_ID)!.amount).toBe(300)

      const gpu = await game.propose({
        kind: 'unit',
        spec: { name: 'Rented Cloud GPU', description: '', parts: [MONEY_ID], upkeep: [MONEY_ID], builderId: null }
      })
      const design = game.accept(gpu!)
      if (design?.kind !== 'research') throw new Error('expected research')
      findResource(game.state, MONEY_ID)!.amount = 1e6
      expect(game.research(design.research.id)).toBe(true)
      const unit = game.state.units.find((u) => u.name === 'Rented Cloud GPU')!
      expect(game.createUnits(unit.id, 2)).toBe(true)
      // The unit design used this week's proposal; the strategy waits for next week.
      expect(game.state.proposedThisWeek).toBe(true)
      game.nextWeek()
      const sell = await game.propose({
        kind: 'strategy',
        spec: { name: 'Sell compute time', description: '', unitId: unit.id, inputIds: [], outputId: MONEY_ID }
      })
      expect(game.accept(sell!)).toMatchObject({ kind: 'added' })
      expect(game.preview.runs[game.state.strategies[0]!.id]?.units).toBe(2)
      game.nextWeek()
      expect(game.lastError).toBe('')
      expect(game.state.stats.proposals).toMatchObject({ resource: 1, income: 1, unit: 1, strategy: 1 })
      expect(game.state.stats.jevCalls).toBe(judge.calls.length)
    })
    for (const text of ['Freelance coding', 'Rented Cloud GPU', 'First income']) expect(html).toContain(text)
  })

  it('offers both a passive income and a strategy for a stock nothing makes, once you own a unit', async () => {
    const before = await render((game) => {
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money' }))
    })
    expect(before).toContain('How will you get this?')
    expect(before).not.toContain('A strategy')
    const after = await render((game) => {
      game.state.resources.push(newResource({ id: MONEY_ID, name: 'Money' }), newResource({ id: 'power', name: 'Power', kind: 'flow' }))
      game.state.units.push(newUnit({ id: 'humans', name: 'Paid Humans', count: 1 }))
    })
    expect(after).toContain('A passive income')
    expect(after).toContain('A strategy')
    // A flow can't be passive income: just the strategy.
    expect(after.match(/A passive income/g)).toHaveLength(1)
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
      const v = await game.propose({ kind: 'mind', spec: { name: 'Custom AI Server', description: '', iq: 180 } })
      const outcome = game.accept(v!)
      expect(outcome?.kind).toBe('research')
      if (outcome?.kind !== 'research') return
      expect(game.research(outcome.research.id)).toBe(true)
      expect(game.state.minds.find((m) => m.name === 'Custom AI Server')?.tier).toBe(1)
    })
    expect(html).toContain('Tier 1')
    expect(html).toContain('Custom AI Server')
    expect(html).toContain('You’ve proposed this week’s research')
  })

  it('renders every tab', async () => {
    for (const tab of ['minds', 'industry', 'research'] as const) {
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
        expect(html).toContain('+ Passive income')
      }
    }
  })

  it('opens proposal dialogs pre-filled from where they were opened', async () => {
    const strategy = await render((game, ui) => {
      game.state.resources.push(newResource({ id: 'power', name: 'Power', kind: 'flow' }), newResource({ id: MONEY_ID, name: 'Money' }))
      ui.openInvent({ kind: 'strategy', outputId: MONEY_ID })
    })
    expect(strategy).toContain('Propose a strategy')
    expect(strategy).toMatch(/<option value="money"[^>]*selected>/)

    const income = await render((_, ui) => ui.openInvent({ kind: 'income' }))
    expect(income).toContain('Propose a passive income')
    expect(income).toContain('Propose a resource first')

    const mind = await render((_, ui) => ui.openInvent({ kind: 'mind', iq: 250 }))
    expect(mind).toContain('Hardware IQ')
    expect(mind).toContain('value="250"')
    expect(mind).toContain('Within reach: about IQ 153–250')
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
    for (const kind of ['resource', 'strategy', 'unit', 'mind', 'income'] as const) {
      const html = await render((_, ui) => ui.openInvent({ kind }))
      expect(html, kind).toContain('aria-label="How this works"')
      expect(html.match(/class="preset small/g)?.length ?? 0, kind).toBeGreaterThanOrEqual(10)
    }
    const resource = await render((_, ui) => ui.openInvent({ kind: 'resource' }))
    expect(resource).toContain(
      'Introduce new resources to the game simulation. Any resources you introduce may be required by the system for future upgrades.'
    )
  })

  it('fills the unit form from a preset and says which resources are missing', async () => {
    const html = await render((_, ui) => ui.openInvent({ kind: 'unit', preset: 'Chip Fab' }))
    expect(html).toContain('value="Chip Fab"')
    expect(html).toContain('Not in the game yet')
    expect(html).toContain('+ Steel')
    expect(html).toContain('+ Power')

    const mind = await render((_, ui) => ui.openInvent({ kind: 'mind', preset: 'Custom AI Server' }))
    expect(mind).toContain('value="Custom Accelerator Rack"')
    expect(mind).toContain('value="250"')
  })
})
