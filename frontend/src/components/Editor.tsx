'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/stores/useStore'
import websocketService from '@/lib/websocket'
import { updateDocument } from '@/lib/api'
import { containsLinks } from '@/lib/linkDetection'
import ReactMarkdown from 'react-markdown'

interface EditorProps {
  setIsConnected: (connected: boolean) => void
}

export default function Editor({ setIsConnected }: EditorProps) {
  const {
    content,
    setContent,
    documentId,
    currentUser,
    setCurrentUser,
    cooldownEnd,
    setCooldown,
    highlightedRange
  } = useStore()
  
  const [isEditing, setIsEditing] = useState(false)
  const [editingPosition, setEditingPosition] = useState(0)
  const [editingContent, setEditingContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const canEdit = () => {
    return !cooldownEnd || new Date() >= cooldownEnd
  }

  const handleWordClick = (e: React.MouseEvent, position: number, word: string) => {
    if (!canEdit()) return
    
    e.preventDefault()
    setIsEditing(true)
    setEditingPosition(position)
    setEditingContent(word)
  }

  const handleSpaceClick = (e: React.MouseEvent, position: number) => {
    if (!canEdit()) return
    
    e.preventDefault()
    setIsEditing(true)
    setEditingPosition(position)
    setEditingContent('')
  }

  const handleEdit = async (newContent: string) => {
    if (newContent === editingContent) {
      setIsEditing(false)
      return
    }

    if (containsLinks(newContent)) {
      alert('Links are not allowed in the content!')
      setIsEditing(false)
      return
    }

    const beforeText = content.slice(0, editingPosition)
    const afterText = content.slice(editingPosition + editingContent.length)
    const fullNewContent = beforeText + newContent + afterText

    try {
      const changeType = editingContent === '' ? 'insert' : newContent === '' ? 'delete' : 'replace'
      
      const change = {
        documentId,
        changeType,
        content: newContent,
        position: editingPosition,
        length: editingContent.length,
        userID: currentUser?.id || '',
        userName: currentUser?.name || 'Anonymous'
      }

      await updateDocument(documentId, change)
      
      websocketService.sendTextChange({
        documentId,
        changeType,
        content: newContent,
        position: editingPosition,
        length: editingContent.length
      })

      setContent(fullNewContent)
      setCooldown(new Date(Date.now() + 30000))
      
    } catch (error) {
      console.error('Failed to save change:', error)
      if (error instanceof Error && error.message.includes('Links are not allowed')) {
        alert('Links are not allowed in the content!')
      }
    }
    
    setIsEditing(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEdit(editingContent)
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  const renderEditableContent = () => {
    if (!content) return null

    const parts = []
    let currentPosition = 0
    
    const words = content.split(/(\s+)/)
    
    for (let i = 0; i < words.length; i++) {
      const part = words[i]
      const isWhitespace = /^\s+$/.test(part)
      
      if (isEditing && currentPosition === editingPosition) {
        parts.push(
          <input
            key={`edit-${currentPosition}`}
            ref={inputRef}
            type="text"
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onBlur={() => handleEdit(editingContent)}
            onKeyDown={handleKeyPress}
            className="inline-block border border-blue-500 bg-blue-50 px-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ minWidth: '20px', width: `${Math.max(20, editingContent.length * 8)}px` }}
          />
        )
      } else if (isWhitespace) {
        parts.push(
          <span
            key={currentPosition}
            className={`cursor-pointer hover:bg-yellow-100 text-gray-800 ${!canEdit() ? 'cursor-not-allowed opacity-50' : ''}`}
            onClick={(e) => handleSpaceClick(e, currentPosition)}
          >
            {part}
          </span>
        )
      } else {
        const isHighlighted = highlightedRange && 
          currentPosition >= highlightedRange.start && 
          currentPosition < highlightedRange.end
        
        parts.push(
          <span
            key={currentPosition}
            className={`
              cursor-pointer hover:bg-blue-100 px-0.5 rounded text-gray-900 font-medium
              ${!canEdit() ? 'cursor-not-allowed opacity-50' : 'hover:text-blue-700'}
              ${isHighlighted ? 'bg-yellow-200 shadow-sm' : ''}
            `}
            onClick={(e) => handleWordClick(e, currentPosition, part)}
          >
            {part}
          </span>
        )
      }
      
      currentPosition += part.length
    }
    
    if (!isEditing) {
      parts.push(
        <span
          key="end"
          className={`cursor-pointer hover:bg-yellow-100 inline-block w-2 text-gray-800 ${!canEdit() ? 'cursor-not-allowed opacity-50' : ''}`}
          onClick={(e) => handleSpaceClick(e, currentPosition)}
        >
          {' '}
        </span>
      )
    }
    
    return parts
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-gray-200 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          {!canEdit() && (
            <div className="text-sm text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
              Cooldown active - wait to edit again
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              showPreview 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {showPreview ? (
          <div className="p-6">
            <ReactMarkdown 
              className="prose prose-lg max-w-none"
              components={{
                h1: ({node, ...props}) => <h1 className="text-3xl font-bold mt-8 mb-4" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-2xl font-semibold mt-6 mb-3" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-xl font-medium mt-4 mb-2" {...props} />,
                p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: ({node, ...props}) => <ul className="mb-4 ml-6 list-disc" {...props} />,
                ol: ({node, ...props}) => <ol className="mb-4 ml-6 list-decimal" {...props} />,
                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props} />,
                pre: ({node, ...props}) => <pre className="bg-gray-100 p-4 rounded-lg mb-4 overflow-x-auto" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div 
            ref={editorRef}
            className="editor-content p-6 font-mono text-lg leading-relaxed min-h-full text-gray-900 bg-white"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace' }}
          >
            {renderEditableContent()}
          </div>
        )}
      </div>
    </div>
  )
}