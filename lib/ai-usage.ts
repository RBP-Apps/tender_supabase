/**
 * Counts OpenAI usage per request so API responses (and the server log) show
 * exactly what each operation consumed. Cost figures are ESTIMATES based on
 * public list prices and are only for reporting.
 */

export type UsageKind = 'chat' | 'vision' | 'verify' | 'extract' | 'embedding'

// USD per 1M tokens (list prices; adjust if your contract differs)
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
}

export interface UsageEntry {
  kind: UsageKind
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
}

export class UsageTracker {
  private entries = new Map<string, UsageEntry>()

  add(kind: UsageKind, model: string, usage: { inputTokens?: number; outputTokens?: number; tokens?: number } | undefined) {
    const key = `${kind}:${model}`
    const e = this.entries.get(key) || { kind, model, calls: 0, inputTokens: 0, outputTokens: 0 }
    e.calls += 1
    e.inputTokens += usage?.inputTokens ?? usage?.tokens ?? 0
    e.outputTokens += usage?.outputTokens ?? 0
    this.entries.set(key, e)
  }

  merge(other?: UsageTracker | null) {
    if (!other) return
    for (const e of other.list()) {
      const key = `${e.kind}:${e.model}`
      const cur = this.entries.get(key) || { ...e, calls: 0, inputTokens: 0, outputTokens: 0 }
      cur.calls += e.calls
      cur.inputTokens += e.inputTokens
      cur.outputTokens += e.outputTokens
      this.entries.set(key, cur)
    }
  }

  list(): UsageEntry[] {
    return Array.from(this.entries.values())
  }

  estimatedCostUsd(): number {
    let usd = 0
    for (const e of this.list()) {
      const p = PRICES[e.model] || PRICES['gpt-4o']
      usd += (e.inputTokens / 1e6) * p.input + (e.outputTokens / 1e6) * p.output
    }
    return Math.round(usd * 10000) / 10000
  }

  toJSON() {
    return { entries: this.list(), estimatedCostUsd: this.estimatedCostUsd() }
  }
}
