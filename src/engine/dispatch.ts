import type { Judge } from '@/ai/jev'
import { acceptCover, judgeCover, type CoverSpec, type CoverVerdict } from './coverProposal'
import { acceptIncome, judgeIncome, type IncomeSpec, type IncomeVerdict } from './incomeProposal'
import { acceptMind, judgeMind, type MindSpec, type MindVerdict } from './mindProposal'
import { acceptPlan, judgePlan, type PlanSpec, type PlanVerdict } from './planProposal'
import {
  acceptResource,
  acceptStrategy,
  judgeResource,
  judgeStrategy,
  type Accepted,
  type ResourceSpec,
  type ResourceVerdict,
  type StrategySpec,
  type StrategyVerdict
} from './proposals'
import type { GameState } from './types'
import { acceptUnit, judgeUnit, type UnitSpec, type UnitVerdict } from './unitProposal'

// Every kind of proposal through one door, for the store and the harness.

export type ProposalInput =
  | { kind: 'resource'; spec: ResourceSpec }
  | { kind: 'strategy'; spec: StrategySpec }
  | { kind: 'unit'; spec: UnitSpec }
  | { kind: 'mind'; spec: MindSpec }
  | { kind: 'income'; spec: IncomeSpec }
  | { kind: 'cover'; spec: CoverSpec }
  | { kind: 'plan'; spec: PlanSpec }

export type Verdict =
  | ResourceVerdict
  | StrategyVerdict
  | UnitVerdict
  | MindVerdict
  | IncomeVerdict
  | CoverVerdict
  | PlanVerdict

/** Asks Jev about any proposal. */
export function judgeAny(s: GameState, judge: Judge, input: ProposalInput): Promise<Verdict> {
  switch (input.kind) {
    case 'resource':
      return judgeResource(s, judge, input.spec)
    case 'strategy':
      return judgeStrategy(s, judge, input.spec)
    case 'unit':
      return judgeUnit(s, judge, input.spec)
    case 'mind':
      return judgeMind(s, judge, input.spec)
    case 'income':
      return judgeIncome(s, judge, input.spec)
    case 'cover':
      return judgeCover(s, judge, input.spec)
    case 'plan':
      return judgePlan(s, judge, input.spec)
  }
}

/** Accepts any verdict. */
export function acceptAny(s: GameState, verdict: Verdict): Accepted {
  switch (verdict.kind) {
    case 'resource':
      return acceptResource(s, verdict)
    case 'strategy':
      return acceptStrategy(s, verdict)
    case 'unit':
      return acceptUnit(s, verdict)
    case 'mind':
      return acceptMind(s, verdict)
    case 'income':
      return acceptIncome(s, verdict)
    case 'cover':
      return acceptCover(s, verdict)
    case 'plan':
      return acceptPlan(s, verdict)
  }
}
