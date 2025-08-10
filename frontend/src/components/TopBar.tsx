'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/stores/useStore'
import { Edit3, Users, FileText, Clock } from 'lucide-react'

interface TopBarProps {
  isConnected: boolean
}

export default function TopBar({ isConnected }: TopBarProps) {
  const { 
    stats, 
    currentUser, 
    updateUserName, 
    cooldownEnd 
  } = useStore()
  
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  useEffect(() => {
    if (!cooldownEnd) {
      setCooldownSeconds(0)
      return
    }

    const updateCountdown = () => {
      const now = new Date()
      const diff = Math.max(0, Math.floor((cooldownEnd.getTime() - now.getTime()) / 1000))
      setCooldownSeconds(diff)
      
      if (diff === 0) {
        useStore.getState().setCooldown(null)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [cooldownEnd])

  const handleNameEdit = () => {
    setTempName(currentUser?.name || '')
    setIsEditingName(true)
  }

  const handleNameSave = () => {
    if (tempName.trim()) {
      updateUserName(tempName.trim())
    }
    setIsEditingName(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave()
    } else if (e.key === 'Escape') {
      setIsEditingName(false)
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <Edit3 className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">StoryChain</h1>
        </div>
        
        <div className="text-sm text-gray-600">
          Real-time collaborative text editor with 30s cooldown per edit
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <FileText className="w-4 h-4" />
            <span className="font-medium">{stats.total_edits}</span>
            <span className="text-gray-500">edits</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <Edit3 className="w-4 h-4" />
            <span className="font-medium">{stats.unique_users}</span>
            <span className="text-gray-500">editors</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <Users className="w-4 h-4" />
            <span className="font-medium">{stats.online_count}</span>
            <span className="text-gray-500">online</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {cooldownSeconds > 0 && (
            <div className="flex items-center space-x-1 text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
              <Clock className="w-4 h-4" />
              <span className="font-medium">{cooldownSeconds}s</span>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleKeyPress}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <button
                onClick={handleNameEdit}
                className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                {currentUser?.name || 'Anonymous'}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}