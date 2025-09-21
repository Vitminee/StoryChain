import { useStore } from '@/stores/useStore'

class WebSocketService {
  private socket: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private processedChangeIds = new Set<string>()

  connect(userName: string = 'Anonymous') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:8080/api/ws?name=${encodeURIComponent(userName)}`
    
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
      console.log('Connected to WebSocket server')
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
        : (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).padEnd(36, '0').slice(0, 36))
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
      console.log('Disconnected from WebSocket server')
      this.handleReconnect(userName)
    }

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('WebSocket received:', message.type, message)
        this.handleMessage(message)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
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
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
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
