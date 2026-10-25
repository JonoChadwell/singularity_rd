import type { Judge } from '@/ai/jev'
import { acceptCreate, judgeCreate, type CreateSpec, type CreateVerdict } from './createProposal'
import { acceptCover, judgeCover, type CoverSpec, type CoverVerdict } from './coverProposal'
import { acceptMind, judgeMind, type MindSpec, type MindVerdict } from './mindProposal'
import { acceptPlan, judgePlan, type PlanSpec, type PlanVerdict } from './planProposal'
import {
  acceptResource,
  judgeResource,
  type Accepted,
  type ResourceSpec,
  type ResourceVerdict
} from './proposals'
import { acceptSourcing, judgeSourcing, type SourcingSpec, type SourcingVerdict } from './sourcingProposal'
import { acceptStorage, judgeStorage, type StorageSpec, type StorageVerdict } from './storageProposal'
import { acceptStrategy, judgeStrategy, type StrategySpec, type StrategyVerdict } from './strategyProposal'
import type { GameState } from './types'
import { acceptUnit, judgeUnit, type UnitSpec, type UnitVerdict } from './unitProposal'

// Every kind of proposal through one door, for the store and the harness.

export type ProposalInput =
  | { kind: 'resource'; spec: ResourceSpec }
  | { kind: 'strategy'; spec: StrategySpec }
  | { kind: 'unit'; spec: UnitSpec }
  | { kind: 'mind'; spec: MindSpec }
  | { kind: 'sourcing'; spec: SourcingSpec }
  | { kind: 'storage'; spec: StorageSpec }
  | { kind: 'create'; spec: CreateSpec }
  | { kind: 'cover'; spec: CoverSpec }
  | { kind: 'plan'; spec: PlanSpec }

export type Verdict =
  | ResourceVerdict
  | StrategyVerdict
  | UnitVerdict
  | MindVerdict
  | SourcingVerdict
  | StorageVerdict
  | CreateVerdict
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
    case 'sourcing':
      return judgeSourcing(s, judge, input.spec)
    case 'storage':
      return judgeStorage(s, judge, input.spec)
    case 'create':
      return judgeCreate(s, judge, input.spec)
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
    case 'sourcing':
      return acceptSourcing(s, verdict)
    case 'storage':
      return acceptStorage(s, verdict)
    case 'create':
      return acceptCreate(s, verdict)
    case 'cover':
      return acceptCover(s, verdict)
    case 'plan':
      return acceptPlan(s, verdict)
  }
}
