'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/stores/useStore'
import websocketService from '@/lib/websocket'
import { fetchDocument, fetchChanges, fetchStats } from '@/lib/api'
import TopBar from './TopBar'
import Editor from './Editor'
import ChangeHistory from './ChangeHistory'

export default function Layout() {
  const [isConnected, setIsConnected] = useState(false)
  const { 
    documentId, 
    setContent, 
    setChanges, 
    setStats,
    currentUser 
  } = useStore()

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [document, changes, stats] = await Promise.all([
          fetchDocument(documentId),
          fetchChanges(documentId),
          fetchStats()
        ])

        setContent(document.content)
        setChanges(changes)
        setStats(stats)
      } catch (error) {
        console.error('Failed to load initial data:', error)
      }
    }

    loadInitialData()
  }, [documentId, setContent, setChanges, setStats])

  useEffect(() => {
    const userName = currentUser?.name || 'Anonymous'
    
    const connect = () => {
      try {
        websocketService.connect(userName)
        setIsConnected(true)
      } catch (error) {
        console.error('WebSocket connection failed:', error)
        setIsConnected(false)
      }
    }

    connect()

    const checkConnection = setInterval(() => {
      const connected = websocketService.isConnected()
      setIsConnected(connected)
      
      if (!connected) {
        connect()
      }
    }, 5000)

    return () => {
      clearInterval(checkConnection)
      websocketService.disconnect()
    }
  }, [currentUser?.name])

  useEffect(() => {
    const updateStatsInterval = setInterval(async () => {
      try {
        const stats = await fetchStats()
        setStats(stats)
      } catch (error) {
        console.error('Failed to update stats:', error)
      }
    }, 10000)

    return () => clearInterval(updateStatsInterval)
  }, [setStats])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar isConnected={isConnected} />
      
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col bg-white border-r border-gray-200">
          <Editor />
        </main>
        
        <ChangeHistory />
      </div>
    </div>
  )
}
