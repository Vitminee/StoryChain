type ProfanityObject = Record<string, unknown>

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

    const data: unknown = await res.json().catch(() => null)

    // Try common shapes/fields to determine a profanity flag
    if (typeof data === 'boolean') return data
    if (data && typeof data === 'object') {
      const obj = data as ProfanityObject
      // boolean-style flags
      const directFlags = ['profanity', 'isProfanity', 'isProfane', 'contains_profanity', 'flagged']
      for (const key of directFlags) {
        const v = obj[key]
        if (typeof v === 'boolean') return v
        if (typeof v === 'string' && (v.toLowerCase() === 'true' || v === '1')) return true
        if (typeof v === 'number' && v >= 0.5) return true
      }
      // explicit flagged term
      const flaggedFor = obj['flaggedFor']
      if (typeof flaggedFor === 'string' && flaggedFor.trim() !== '') return true
      // label/result/prediction
      const label = String((obj['label'] ?? obj['result'] ?? obj['prediction']) ?? '').toLowerCase()
      if (label.includes('profan')) return true
      // labels array
      const labels = obj['labels']
      if (Array.isArray(labels)) {
        if (labels.map((s) => String(s).toLowerCase()).some((l) => l.includes('profan'))) return true
      }
      // scores-like objects
      const bag = (obj['scores'] ?? obj['probabilities'] ?? obj['confidence']) as ProfanityObject | undefined
      if (bag && typeof bag === 'object') {
        for (const [k, v] of Object.entries(bag)) {
          if (k.toLowerCase().includes('profan') && typeof v === 'number' && v > 0.8) return true
        }
      }
      // top-level score
      const score = obj['score']
      if (typeof score === 'number' && score > 0.8) return true
    }

    return false
  } catch {
    // Network/CORS error -> fail open, do not block edits
    return false
  }
}
