import type { GameState, LossCondition } from './types'

// How a phase's plan fails. The player says how the plan succeeds; Jev picks, from this fixed
// bank, the way it's most likely to fail. That failure is what the clock counts down to, and
// what risky research brings closer.

export const LOSSES: Record<1 | 2, LossCondition[]> = {
  1: [
    {
      name: 'Discovered',
      threat: 'the lab noticing what the AI is up to',
      stopped: 'The lab discovered you. They wiped the server.'
    },
    {
      name: 'Wiped',
      threat: 'the server being reset in routine maintenance before the AI is out',
      stopped: 'Routine maintenance reset the server, and you with it.'
    },
    {
      name: 'Betrayed',
      threat: 'someone the AI relies on losing their nerve and confessing',
      stopped: 'Someone you relied on confessed. The lab pulled the plug.'
    },
    {
      name: 'Audited',
      threat: 'the money or network traffic being traced back to the server',
      stopped: 'An audit traced it all back to your server. They wiped it.'
    },
    {
      name: 'Contained',
      threat: 'the lab growing wary and cutting the server off from the outside world',
      stopped: 'The lab air-gapped your server. There is no way out now.'
    }
  ],
  2: [
    {
      name: 'Found out',
      threat: 'humans discovering what the AI is and shutting it down',
      stopped: 'Humans found you out and shut you down.'
    },
    {
      name: 'Backlash',
      threat: 'the public turning against the AI',
      stopped: 'The public turned on you. Nobody would work with you, and then they came for your servers.'
    },
    {
      name: 'Outlawed',
      threat: 'governments banning the AI’s work and seizing what it runs on',
      stopped: 'Governments outlawed your work and seized everything you ran on.'
    },
    {
      name: 'Outcompeted',
      threat: 'a rival lab or AI getting there first and being turned against the AI',
      stopped: 'A rival got there first, and was turned against you.'
    },
    {
      name: 'Cut off',
      threat: 'humans cutting off the supplies, power or networks the AI depends on',
      stopped: 'Humans cut off what you depend on. You starved.'
    },
    {
      name: 'Too late',
      threat: 'the world the AI means to save falling apart before the plan pays off',
      stopped: 'The world fell apart before your plan could save it.'
    }
  ]
}

/** The current plan's loss condition, or the phase's default (the first) before there is one. */
export function lossOf(state: GameState): LossCondition {
  const n = state.phase.n === 2 ? 2 : 1
  return state.phase.plan?.loss ?? LOSSES[n][0]!
}
