import { create } from 'zustand'

export interface User {
  id: string
  name: string
  status: 'online' | 'offline'
}

export interface Change {
  id: string
  user_name: string
  change_type: string
  content: string
  position: number
  length: number
  timestamp: string
}

export interface Stats {
  total_edits: number
  unique_users: number
  online_count: number
}

interface StoreState {
  // Document
  documentId: string
  content: string
  setContent: (content: string) => void
  setDocumentId: (id: string) => void
  
  // Users
  currentUser: User | null
  onlineUsers: User[]
  setCurrentUser: (user: User) => void
  addOnlineUser: (user: User) => void
  removeOnlineUser: (userId: string) => void
  updateUserName: (name: string) => void
  
  // Changes
  changes: Change[]
  addChange: (change: Change) => void
  setChanges: (changes: Change[]) => void
  
  // Stats
  stats: Stats
  setStats: (stats: Stats) => void
  
  // Cooldown
  cooldownEnd: Date | null
  setCooldown: (cooldownEnd: Date | null) => void
  
  // UI
  selectedChangeId: string | null
  setSelectedChangeId: (id: string | null) => void
  highlightedRange: { start: number; end: number } | null
  setHighlightedRange: (range: { start: number; end: number } | null) => void
}

export const useStore = create<StoreState>((set, get) => ({
  // Document
  documentId: '00000000-0000-0000-0000-000000000001',
  content: '',
  setContent: (content) => set({ content }),
  setDocumentId: (documentId) => set({ documentId }),
  
  // Users
  currentUser: null,
  onlineUsers: [],
  setCurrentUser: (currentUser) => set({ currentUser }),
  addOnlineUser: (user) => set((state) => ({
    onlineUsers: [...state.onlineUsers.filter(u => u.id !== user.id), user]
  })),
  removeOnlineUser: (userId) => set((state) => ({
    onlineUsers: state.onlineUsers.filter(u => u.id !== userId)
  })),
  updateUserName: (name) => set((state) => ({
    currentUser: state.currentUser ? { ...state.currentUser, name } : null
  })),
  
  // Changes
  changes: [],
  addChange: (change) => set((state) => ({
    changes: [change, ...state.changes].slice(0, 50)
  })),
  setChanges: (changes) => set({ changes }),
  
  // Stats
  stats: { total_edits: 0, unique_users: 0, online_count: 0 },
  setStats: (stats) => set({ stats }),
  
  // Cooldown
  cooldownEnd: null,
  setCooldown: (cooldownEnd) => set({ cooldownEnd }),
  
  // UI
  selectedChangeId: null,
  setSelectedChangeId: (selectedChangeId) => set({ selectedChangeId }),
  highlightedRange: null,
  setHighlightedRange: (highlightedRange) => set({ highlightedRange }),
}))