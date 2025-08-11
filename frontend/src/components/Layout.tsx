'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/stores/useStore'
import websocketService from '@/lib/websocket'
import { fetchDocument, fetchChanges, fetchStats } from '@/lib/api'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
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

        console.log('Document loaded:', document.content?.length || 0, 'characters')
        console.log('Changes loaded:', changes?.length || 0, 'changes')
        console.log('First change:', changes?.[0])
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
        <Sidebar />
        
        <main className="flex-1 flex flex-col bg-white border-x border-gray-200">
          <Editor setIsConnected={setIsConnected} />
        </main>
        
        <ChangeHistory />
      </div>
    </div>
  )
}