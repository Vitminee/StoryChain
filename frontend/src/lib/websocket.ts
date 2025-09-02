import { useStore } from '@/stores/useStore'

class WebSocketService {
  private socket: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  connect(userName: string = 'Anonymous') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:8080/api/ws?name=${encodeURIComponent(userName)}`
    
    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = () => {
      console.log('Connected to WebSocket server')
      this.reconnectAttempts = 0
      
      const store = useStore.getState()
      store.setCurrentUser({
        id: Math.random().toString(36).substring(7),
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
      
      case 'text_change':
        console.log('WebSocket received text_change:', message.data)
        console.log('Current user ID:', store.currentUser?.id)
        console.log('Message user ID:', message.data.userID)
        
        if (message.data.userID !== store.currentUser?.id) {
          console.log('Adding change from other user to history')
          store.addChange({
            id: message.data.changeID || Date.now().toString(),
            user_name: message.data.userName,
            change_type: message.data.changeType,
            content: message.data.content,
            position: message.data.position,
            length: message.data.length || 0,
            timestamp: new Date().toISOString()
          })
        } else {
          console.log('Skipping own change (user ID matches)')
        }
        break
      
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