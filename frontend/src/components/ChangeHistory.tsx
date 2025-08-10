'use client'

import { useStore } from '@/stores/useStore'
import { Clock, Plus, Minus, Edit3 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ChangeHistory() {
  const { 
    changes, 
    selectedChangeId, 
    setSelectedChangeId,
    setHighlightedRange 
  } = useStore()

  const handleChangeHover = (change: any) => {
    setHighlightedRange({
      start: change.position,
      end: change.position + change.length
    })
  }

  const handleChangeLeave = () => {
    setHighlightedRange(null)
  }

  const handleChangeClick = (change: any) => {
    setSelectedChangeId(selectedChangeId === change.id ? null : change.id)
    
    const editor = document.querySelector('.editor-content')
    if (editor) {
      const textContent = editor.textContent || ''
      const position = Math.min(change.position, textContent.length)
      
      const range = document.createRange()
      const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null
      )
      
      let currentPos = 0
      let textNode = walker.nextNode()
      
      while (textNode && currentPos + textNode.textContent!.length < position) {
        currentPos += textNode.textContent!.length
        textNode = walker.nextNode()
      }
      
      if (textNode) {
        range.setStart(textNode, Math.max(0, position - currentPos))
        range.collapse(true)
        
        const rect = range.getBoundingClientRect()
        const editorRect = editor.getBoundingClientRect()
        
        editor.scrollTo({
          top: editor.scrollTop + rect.top - editorRect.top - 100,
          behavior: 'smooth'
        })
      }
    }
  }

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'insert':
        return <Plus className="w-3 h-3 text-green-600" />
      case 'delete':
        return <Minus className="w-3 h-3 text-red-600" />
      case 'replace':
        return <Edit3 className="w-3 h-3 text-blue-600" />
      default:
        return <Edit3 className="w-3 h-3 text-gray-600" />
    }
  }

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'insert':
        return 'border-l-green-400 bg-green-50 hover:bg-green-100'
      case 'delete':
        return 'border-l-red-400 bg-red-50 hover:bg-red-100'
      case 'replace':
        return 'border-l-blue-400 bg-blue-50 hover:bg-blue-100'
      default:
        return 'border-l-gray-400 bg-gray-50 hover:bg-gray-100'
    }
  }

  const formatTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return 'Unknown time'
    }
  }

  return (
    <aside className="w-80 bg-gray-50 border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 flex items-center">
          <Clock className="w-4 h-4 mr-2" />
          Recent Changes
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Hover to highlight • Click to navigate
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {changes.length === 0 ? (
          <div className="text-center py-8 px-4 text-gray-500 text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No changes yet</p>
            <p className="text-xs mt-1">Start editing to see history</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {changes.map((change) => (
              <div
                key={change.id}
                className={`
                  border-l-4 p-3 rounded-r cursor-pointer transition-colors
                  ${getChangeColor(change.change_type)}
                  ${selectedChangeId === change.id ? 'ring-2 ring-blue-300' : ''}
                `}
                onMouseEnter={() => handleChangeHover(change)}
                onMouseLeave={handleChangeLeave}
                onClick={() => handleChangeClick(change)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {getChangeIcon(change.change_type)}
                    <span className="text-sm font-medium text-gray-900">
                      {change.user_name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTime(change.timestamp)}
                  </span>
                </div>
                
                <div className="mt-2">
                  <div className="text-xs text-gray-600 capitalize mb-1">
                    {change.change_type} at position {change.position}
                  </div>
                  <div className="text-sm bg-white p-2 rounded border text-gray-900 font-mono">
                    {change.content.length > 100 
                      ? `${change.content.slice(0, 100)}...` 
                      : change.content || '(deleted text)'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}