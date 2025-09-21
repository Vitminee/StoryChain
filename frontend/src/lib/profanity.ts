type ProfanityShape =
  | boolean
  | {
      profanity?: boolean
      isProfane?: boolean
      isProfanity?: boolean
      flagged?: boolean | string | number
      contains_profanity?: boolean
      label?: string
      result?: string
      prediction?: string
      labels?: unknown[]
      scores?: Record<string, unknown>
      probabilities?: Record<string, unknown>
      confidence?: Record<string, unknown>
      score?: number
      flaggedFor?: string
    }

export async function checkProfanity(message: string): Promise<boolean> {
  try {
    const res = await fetch('https://vector.profanity.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    if (!res.ok) {
      // If the service is unavailable or blocked by CORS, fail open
      return false
    }

    const data: unknown = await res.json().catch(() => ({}))

    // Try common shapes/fields to determine a profanity flag
    if (typeof data === 'boolean') return data
    if (data && typeof data === 'object') {
      const obj = data as ProfanityShape & Record<string, unknown>
      if (typeof obj.profanity === 'boolean') return obj.profanity
      if (typeof (obj as any).isProfanity === 'boolean') return (obj as any).isProfanity as boolean
      if (typeof obj.isProfane === 'boolean') return obj.isProfane
      if (typeof obj.contains_profanity === 'boolean') return obj.contains_profanity
      if (typeof obj.flagged === 'boolean') return obj.flagged
      if (typeof obj.flagged === 'string') return obj.flagged.toLowerCase() === 'true'
      if (typeof obj.flagged === 'number') return obj.flagged >= 0.5
      if (typeof obj.flaggedFor === 'string' && obj.flaggedFor.trim() !== '') return true
      const label = String(obj.label || obj.result || obj.prediction || '').toLowerCase()
      if (label.includes('profan')) return true
      const labels = Array.isArray(obj.labels) ? obj.labels : []
      if (labels.map((s: unknown) => String(s).toLowerCase()).some((l) => l.includes('profan'))) return true
      const bag = (obj.scores || obj.probabilities || obj.confidence) as Record<string, unknown> | undefined
      if (bag && typeof bag === 'object') {
        for (const [k, v] of Object.entries(bag)) {
          if (k.toLowerCase().includes('profan') && typeof v === 'number' && v > 0.8) return true
        }
      }
      if (typeof obj.score === 'number' && obj.score > 0.8) return true
    }

    const label = String(data?.label || data?.result || data?.prediction || '').toLowerCase()
    if (label.includes('profan')) return true

    const categories: string[] = Array.isArray(data?.labels) ? data.labels.map((s: any) => String(s).toLowerCase()) : []
    if (categories.some((l) => l.includes('profan'))) return true

    const scores = data?.scores || data?.probabilities || data?.confidence || {}
    const scoreValues = typeof scores === 'object' && scores ? Object.entries(scores) as Array<[string, any]> : []
    if (scoreValues.some(([k, v]) => String(k).toLowerCase().includes('profan') && Number(v) > 0.8)) {
      return true
    }

    return false
  } catch {
    // Network/CORS error -> fail open, do not block edits
    return false
  }
}
