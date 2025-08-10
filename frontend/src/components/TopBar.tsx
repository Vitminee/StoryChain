'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/stores/useStore'
import { PencilSquareIcon, UsersIcon, DocumentTextIcon, ClockIcon } from '@heroicons/react/24/outline'

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
          <PencilSquareIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">StoryChain</h1>
        </div>
        
        <div className="text-sm text-gray-600">
          Real-time collaborative text editor with 30s cooldown per edit
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <DocumentTextIcon className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-gray-900">{stats.total_edits}</span>
            <span className="text-gray-600">edits</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <PencilSquareIcon className="w-4 h-4 text-purple-600" />
            <span className="font-medium text-gray-900">{stats.unique_users}</span>
            <span className="text-gray-600">editors</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <UsersIcon className="w-4 h-4 text-green-600" />
            <span className="font-medium text-gray-900">{stats.online_count}</span>
            <span className="text-gray-600">online</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleKeyPress}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-white"
                autoFocus
              />
            ) : (
              <button
                onClick={handleNameEdit}
                className="px-2 py-1 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                {currentUser?.name || 'Anonymous'}
              </button>
            )}
            
            <div className={`font-mono text-lg font-bold ${cooldownSeconds > 0 ? 'text-red-500' : 'text-green-400'}`}>
              {cooldownSeconds > 0 
                ? `${String(Math.floor(cooldownSeconds / 60)).padStart(2, '0')}:${String(cooldownSeconds % 60).padStart(2, '0')}`
                : '00:00'
              }
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}