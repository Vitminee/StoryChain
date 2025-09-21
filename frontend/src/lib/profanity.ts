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

    const data: any = await res.json().catch(() => ({}))

    // Try common shapes/fields to determine a profanity flag
    if (typeof data === 'boolean') return data
    if (typeof data?.profanity === 'boolean') return data.profanity
    if (typeof data?.isProfane === 'boolean') return data.isProfane
    if (typeof data?.flagged === 'boolean') return data.flagged
    if (typeof data?.contains_profanity === 'boolean') return data.contains_profanity

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
  } catch (e) {
    // Network/CORS error -> fail open, do not block edits
    return false
  }
}

