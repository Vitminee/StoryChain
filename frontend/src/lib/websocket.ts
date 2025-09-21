import { useStore } from '@/stores/useStore'

class WebSocketService {
  private socket: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private processedChangeIds = new Set<string>()

  private generateUuid(): string {
    // Prefer secure, standards-based UUID
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID()
    }
    // Fallback: UUID v4 using crypto.getRandomValues
    if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
      const bytes = new Uint8Array(16)
      ;(crypto as any).getRandomValues(bytes)
      // Per RFC 4122 version 4
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'))
      return (
        hex.slice(0, 4).join('') + '-' +
        hex.slice(4, 6).join('') + '-' +
        hex.slice(6, 8).join('') + '-' +
        hex.slice(8, 10).join('') + '-' +
        hex.slice(10, 16).join('')
      )
    }
    // Last resort: static placeholder (should not happen in modern browsers)
    return '00000000-0000-4000-8000-000000000000'
  }

  connect(userName: string = 'Anonymous') {
    // Build WS URL from env when provided, else derive from API base/host
    let wsUrl = ''
    const configured = process.env.NEXT_PUBLIC_WS_URL
    if (configured && /^wss?:\/\//i.test(configured)) {
      wsUrl = `${configured.replace(/\/?$/, '')}?name=${encodeURIComponent(userName)}`
    } else {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
      try {
        const base = new URL(
          apiBase || `${window.location.protocol}//${window.location.hostname}:8080`
        )
        const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${wsProtocol}//${base.host}/api/ws?name=${encodeURIComponent(userName)}`
      } catch {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${wsProtocol}//${window.location.hostname}:8080/api/ws?name=${encodeURIComponent(userName)}`
      }
    }
    
    // Prevent duplicate connections
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        return this.socket
      }
      try { this.socket.close() } catch {}
      this.socket = null
    }

    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = () => {
      this.reconnectAttempts = 0
      
      const store = useStore.getState()
      // Ensure a stable UUID for this client so we can
      // reliably identify "own" changes from broadcasts
      let existingId = undefined as string | undefined
      try {
        existingId = localStorage.getItem('storychain-user-id') || undefined
      } catch {}
      const userId = existingId && existingId.length === 36
        ? existingId
        : this.generateUuid()
      try {
        localStorage.setItem('storychain-user-id', userId)
      } catch {}

      store.setCurrentUser({
        id: userId,
        name: userName,
        status: 'online'
      })
    }

    this.socket.onclose = () => {
      this.handleReconnect(userName)
    }

    this.socket.onerror = () => {}

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleMessage(message)
      } catch (error) {
        // swallow parse errors
      }
    }

    return this.socket
  }

  private handleMessage(message: any) {
    const store = useStore.getState()
    
    switch (message.type) {
      case 'user_presence':
        if (message.data.status === 'joined') {
          store.addOnlineUser({
            id: message.data.userID,
            name: message.data.userName,
            status: 'online'
          })
        } else if (message.data.status === 'left') {
          store.removeOnlineUser(message.data.userID)
        }
        break
      
      case 'text_change': {
        const data = message.data || {}

        // De-duplicate by changeID if present
        const changeId: string | undefined = data.changeID
        if (changeId) {
          if (this.processedChangeIds.has(changeId)) {
            break
          }
          this.processedChangeIds.add(changeId)
          if (this.processedChangeIds.size > 1000) {
            this.processedChangeIds = new Set(Array.from(this.processedChangeIds).slice(-500))
          }
        }

        const isOwn = data.userID && data.userID === store.currentUser?.id
        // Only apply for active document
        if (data.documentId && data.documentId !== store.documentId) {
          break
        }

        // Apply remote change to the current content for other users
        if (!isOwn) {
          const current = store.content || ''
          const pos = Math.max(0, Math.min(Number(data.position) || 0, current.length))
          const len = Math.max(0, Math.min(Number(data.length) || 0, current.length - pos))
          let updated = current
          switch (data.changeType) {
            case 'insert': {
              const before = current.slice(0, pos)
              const after = current.slice(pos)
              updated = before + (data.content || '') + after
              break
            }
            case 'delete': {
              const before = current.slice(0, pos)
              const after = current.slice(pos + len)
              updated = before + after
              break
            }
            case 'replace': {
              const before = current.slice(0, pos)
              const after = current.slice(pos + len)
              updated = before + (data.content || '') + after
              break
            }
            default:
              // Unknown type, do nothing
              break
          }
          if (updated !== current) {
            store.setContent(updated)
          }
        }

        // Update change history for visibility
        if (!isOwn) {
          store.addChange({
            id: data.changeID || Date.now().toString(),
            user_name: data.userName,
            change_type: data.changeType,
            content: data.content,
            position: data.position,
            length: data.length || 0,
            timestamp: new Date().toISOString()
          })
        }
        break
      }
      
      case 'stats_update':
        store.setStats(message.data)
        break
    }
  }

  private handleReconnect(userName: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      
      setTimeout(() => {
        this.connect(userName)
      }, Math.pow(2, this.reconnectAttempts) * 1000)
    }
  }

  sendTextChange(change: {
    documentId: string
    changeType: string
    content: string
    position: number
    length: number
  }) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const store = useStore.getState()
      const message = {
        type: 'text_change',
        data: {
          ...change,
          userID: store.currentUser?.id,
          userName: store.currentUser?.name
        }
      }
      this.socket.send(JSON.stringify(message))
    }
  }

  updateUserName(newName: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'user_update',
        data: { name: newName }
      }
      this.socket.send(JSON.stringify(message))
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN
  }
}

export const websocketService = new WebSocketService()
export default websocketService
