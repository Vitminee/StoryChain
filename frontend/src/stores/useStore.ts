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

export const useStore = create<StoreState>((set) => ({
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
  addChange: (change) => set((state) => {
    // Avoid duplicates by id
    if (state.changes.some((c) => c.id === change.id)) {
      return { changes: state.changes }
    }
    return { changes: [change, ...state.changes].slice(0, 50) }
  }),
  setChanges: (changes) => set({ changes }),
  
  // Stats
  stats: { total_edits: 0, unique_users: 0, online_count: 0 },
  setStats: (stats) => set({ stats }),
  
  // Cooldown
  cooldownEnd: (() => {
    try {
      const stored = localStorage.getItem('storychain-cooldown')
      if (stored) {
        const cooldownDate = new Date(stored)
        // Only use stored cooldown if it's still in the future
        if (cooldownDate > new Date()) {
          return cooldownDate
        }
        // Clean up expired cooldown
        localStorage.removeItem('storychain-cooldown')
      }
    } catch {
      // Ignore localStorage errors
    }
    return null
  })(),
  setCooldown: (cooldownEnd) => {
    set({ cooldownEnd })
    // Persist cooldown to localStorage
    if (cooldownEnd) {
      localStorage.setItem('storychain-cooldown', cooldownEnd.toISOString())
    } else {
      localStorage.removeItem('storychain-cooldown')
    }
  },
  
  // UI
  selectedChangeId: null,
  setSelectedChangeId: (selectedChangeId) => set({ selectedChangeId }),
  highlightedRange: null,
  setHighlightedRange: (highlightedRange) => set({ highlightedRange }),
}))
