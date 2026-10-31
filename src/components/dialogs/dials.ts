import { EFFICIENCY, EFFICIENCY_BOUNDS } from '@/engine/balance'
import { bandOf, efficiencyLevel, efficiencyValue, type VerdictBase } from '@/engine/proposals'
import type { GaugeZone } from '../kit/AnalogGauge.vue'
import type { Dial } from '../kit/VerdictDial.vue'

// Builders for the dials a verdict shows. Every verdict has the plausible dial first; a dialog
// adds more by passing VerdictView `dials` built here.

/** Plausibility against its bar: red below, green above, and the verdict on the whole proposal. */
export function plausibleDial(v: Pick<VerdictBase, 'plausibility' | 'bar' | 'rejected' | 'duplicateOf'>, title = 'Plausibility'): Dial {
  return {
    key: 'plausible',
    title,
    value: v.plausibility,
    label: `plausible · bar ${Math.round(v.bar * 100)}%`,
    valueTone: v.plausibility >= v.bar ? 'good' : 'bad',
    zones: [
      { from: 0, to: v.bar, tone: 'bad' },
      { from: v.bar, to: 1, tone: 'good' }
    ],
    marks: [v.bar],
    verdict: v.rejected
      ? { text: 'Rejected', tone: 'bad' }
      : v.duplicateOf
        ? { text: 'Duplicate', tone: 'ai' }
        : { text: 'Accepted', tone: 'good' }
  }
}

const BAND_TONES = ['a', 'b', 'c']

/**
 * A 0–1 answer read in bands (see bandOf): one colour per band, a heavy tick where each ends, and
 * the band it falls in as the verdict. `labels` names each band, short enough for a stamp.
 */
export function bandDial(o: {
  key: string
  title: string
  value: number
  bounds: readonly number[]
  labels: readonly string[]
  label: string
  ends?: [string, string]
}): Dial {
  const zones: GaugeZone[] = o.bounds.map((upTo, i) => ({
    from: o.bounds[i - 1] ?? 0,
    to: upTo,
    tone: BAND_TONES[i % BAND_TONES.length]!
  }))
  return {
    key: o.key,
    title: o.title,
    value: o.value,
    label: o.label,
    valueTone: 'info',
    zones,
    marks: o.bounds.slice(0, -1),
    ends: o.ends,
    verdict: { text: o.labels[bandOf(o.value, o.bounds)] ?? '', tone: 'info' }
  }
}

/** How effective Jev thinks a strategy or Procurement is, in EFFICIENCY's bands. The stamp counts a repeat's lost step. */
export function efficiencyDial(v: Pick<VerdictBase, 'answers' | 'picks' | 'repeatOf'>): Dial {
  const dial = bandDial({
    key: 'efficiency',
    title: 'Efficiency',
    value: efficiencyValue(v),
    bounds: EFFICIENCY_BOUNDS,
    labels: EFFICIENCY.map(([label]) => label),
    label: 'more effective than the ordinary way',
    ends: ['Wasteful', 'Brilliant']
  })
  return { ...dial, verdict: { text: EFFICIENCY[efficiencyLevel(v)]![0], tone: v.repeatOf ? 'bad' : 'info' } }
}
