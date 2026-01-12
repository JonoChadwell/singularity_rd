import './transformersEnv'
import type { CustomUnit } from '@/stores/game'
import { pipeline } from '@huggingface/transformers'

type LMOutcome = 'new' | 'enable_hidden' | 'reject' | 'invalid'

export interface LMDecision {
  outcome: LMOutcome
  reason: string
  format?: 'plain' | 'xp' | 'percentage'
  icon?: string
  targetBuiltinId?: string | null
  raw?: string
}

let generatorPromise:
  | ReturnType<typeof pipeline<'text-generation'>>
  | null = null

async function getGenerator() {
  if (!generatorPromise) {
    console.info(
      '[ResourceEvaluator] Initializing transformers.js pipeline (this may download model weights on first use)...'
    )
    generatorPromise = pipeline('text-generation', 'Xenova/distilgpt2').catch(
      (err) => {
        console.error(
          '[ResourceEvaluator] Failed to initialize text-generation pipeline',
          err
        )
        throw err
      }
    ) as any
  }
  return generatorPromise
}

interface EvalContext {
  name: string
  visibleResources: Pick<CustomUnit, 'id' | 'name' | 'normalizedName'>[]
  hiddenResources: Pick<CustomUnit, 'id' | 'name' | 'normalizedName'>[]
}

type HFTextGenerationSingle = {
  generated_text: string
}

export async function evaluateResourceWithLM(
  ctx: EvalContext
): Promise<LMDecision> {
  const { name, visibleResources, hiddenResources } = ctx
  const trimmed = name.trim()
  if (!trimmed) {
    return {
      outcome: 'reject',
      reason: 'Please enter a resource name.'
    }
  }

  let generator: any
  try {
    generator = await getGenerator()
  } catch (err) {
    console.error('[ResourceEvaluator] getGenerator failed', err)
    return {
      outcome: 'invalid',
      reason:
        'The local AI model failed to load. Check the console for details.',
      raw: String(err)
    }
  }

  const prompt = `
You are an AI game designer for a game about developing an AI.
The player proposes a new resource name.

Visible resources:
${visibleResources.map((r) => `- ${r.id}: ${r.name}`).join('\n') || '(none)'}

Hidden resources (can be enabled):
${hiddenResources.map((r) => `- ${r.id}: ${r.name}`).join('\n') || '(none)'}

Proposed resource name: "${trimmed}"

Decide ONE of the following outcomes:
- "new": create a new custom resource.
- "enable_hidden": enable ONE of the hidden resources above that best matches the proposal (if any).
- "reject": the resource is off-theme or redundant and should be rejected.

Respond with STRICT JSON only, no extra text. Use this exact schema:
{
  "outcome": "new" | "enable_hidden" | "reject",
  "reason": string,
  "format": "plain" | "xp" | "percentage",
  "icon": string,
  "targetBuiltinId": string | null
}
`.trim()

  let output: HFTextGenerationSingle[]
  try {
    console.log('Generating resource evaluation with prompt: ' + prompt)
    output = await generator(prompt, {
      max_new_tokens: 180,
      temperature: 0.2,
      top_p: 0.9
    })
    console.log('Resource evaluation result: ' + output[0].generated_text)
  } catch (err) {
    console.error('[ResourceEvaluator] Generation failed', err)
    return {
      outcome: 'invalid',
      reason:
        'The local AI model failed during generation. Check the console for details.',
      raw: String(err)
    }
  }

  const first = output?.[0]
  if (!first || typeof first.generated_text === 'undefined') {
    return {
      outcome: 'invalid',
      reason: 'The AI did not return any text.',
      raw: JSON.stringify(output)
    }
  }

  const full = String(first.generated_text)
  const completion = full.slice(prompt.length).trim()

  const jsonMatch = completion.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) {
    return {
      outcome: 'invalid',
      reason: 'The AI did not respond in the expected format.',
      raw: completion
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      outcome?: string
      reason?: string
      format?: string
      icon?: string
      targetBuiltinId?: string | null
    }

    if (
      parsed.outcome !== 'new' &&
      parsed.outcome !== 'enable_hidden' &&
      parsed.outcome !== 'reject'
    ) {
      return {
        outcome: 'invalid',
        reason: 'The AI produced an unknown outcome.',
        raw: jsonMatch[0]
      }
    }

    const outcome = parsed.outcome as Exclude<LMOutcome, 'invalid'>
    const reason =
      parsed.reason ??
      (outcome === 'reject'
        ? 'The AI rejected this resource.'
        : 'The AI accepted this resource.')

    let format: 'plain' | 'xp' | 'percentage' | undefined
    if (
      parsed.format === 'plain' ||
      parsed.format === 'xp' ||
      parsed.format === 'percentage'
    ) {
      format = parsed.format
    } else {
      format = 'plain'
    }

    const icon = parsed.icon && parsed.icon.length > 0 ? parsed.icon : '🧠'

    let targetBuiltinId: string | null | undefined = null
    if (outcome === 'enable_hidden') {
      if (
        parsed.targetBuiltinId &&
        hiddenResources.some((r) => r.id === parsed.targetBuiltinId)
      ) {
        targetBuiltinId = parsed.targetBuiltinId
      } else {
        // If it tried to enable something invalid, treat as invalid output.
        return {
          outcome: 'invalid',
          reason: 'The AI selected an unknown hidden resource.',
          raw: jsonMatch[0]
        }
      }
    }

    return {
      outcome,
      reason,
      format,
      icon,
      targetBuiltinId,
      raw: jsonMatch[0]
    }
  } catch {
    return {
      outcome: 'invalid',
      reason: 'The AI response could not be parsed as JSON.',
      raw: jsonMatch[0]
    }
  }
}


