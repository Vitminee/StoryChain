// Prefer environment-configured base URL; fallback to localhost:8080
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8080`
    : 'http://localhost:8080')

export async function fetchDocument(documentId: string) {
  const response = await fetch(`${API_BASE_URL}/api/document/${documentId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch document')
  }
  return response.json()
}

export type ChangePayload = {
  document_id: string
  change_type: 'insert' | 'delete' | 'replace' | string
  content: string
  position: number
  length: number
  user_id: string
  user_name: string
}

export async function updateDocument(documentId: string, change: ChangePayload) {
  const response = await fetch(`${API_BASE_URL}/api/document/${documentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(change),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update document')
  }
  
  return response.json()
}

export async function fetchChanges(documentId: string) {
  const response = await fetch(`${API_BASE_URL}/api/changes/${documentId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch changes')
  }
  return response.json()
}

export async function fetchStats() {
  const response = await fetch(`${API_BASE_URL}/api/stats`)
  if (!response.ok) {
    throw new Error('Failed to fetch stats')
  }
  return response.json()
}
