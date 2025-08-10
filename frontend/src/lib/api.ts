const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-production-api.com' 
  : 'http://localhost:8080'

export async function fetchDocument(documentId: string) {
  const response = await fetch(`${API_BASE_URL}/api/document/${documentId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch document')
  }
  return response.json()
}

export async function updateDocument(documentId: string, change: any) {
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