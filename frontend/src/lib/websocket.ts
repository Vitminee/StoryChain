import io, { Socket } from 'socket.io-client'
import { useStore } from '@/stores/useStore'

class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  connect(userName: string = 'Anonymous') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:8080/api/ws?name=${encodeURIComponent(userName)}`
    
    this.socket = io(wsUrl, {
      transports: ['websocket'],
      upgrade: false,
    })

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server')
      this.reconnectAttempts = 0
      
      const store = useStore.getState()
      store.setCurrentUser({
        id: this.socket?.id || '',
        name: userName,
        status: 'online'
      })
    })

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server')
      this.handleReconnect(userName)
    })

    this.socket.on('user_presence', (data: any) => {
      const store = useStore.getState()
      if (data.status === 'joined') {
        store.addOnlineUser({
          id: data.userID,
          name: data.userName,
          status: 'online'
        })
      } else if (data.status === 'left') {
        store.removeOnlineUser(data.userID)
      }
    })

    this.socket.on('text_change', (data: any) => {
      const store = useStore.getState()
      
      if (data.userID !== store.currentUser?.id) {
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
    })

    this.socket.on('stats_update', (stats: any) => {
      const store = useStore.getState()
      store.setStats(stats)
    })

    return this.socket
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
    if (this.socket?.connected) {
      const store = useStore.getState()
      this.socket.emit('text_change', {
        type: 'text_change',
        data: {
          ...change,
          userID: store.currentUser?.id,
          userName: store.currentUser?.name
        }
      })
    }
  }

  updateUserName(newName: string) {
    if (this.socket?.connected) {
      this.socket.emit('user_update', {
        type: 'user_update',
        data: { name: newName }
      })
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  isConnected() {
    return this.socket?.connected || false
  }
}

export const websocketService = new WebSocketService()
export default websocketService