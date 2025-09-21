'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/stores/useStore'
import { updateDocument } from '@/lib/api'
import { containsLinks } from '@/lib/linkDetection'
// Profanity check moved to backend for async moderation

interface EditorProps {
  setIsConnected: (connected: boolean) => void
}

export default function Editor({ setIsConnected }: EditorProps) {
  const {
    content,
    setContent,
    documentId,
    currentUser,
    cooldownEnd,
    setCooldown,
    highlightedRange,
    addChange
  } = useStore()
  
  const [isEditing, setIsEditing] = useState(false)
  const [editingPosition, setEditingPosition] = useState(0)
  const [editingContent, setEditingContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  // preview state removed (unused)
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
    setOriginalContent(word)
  }

  const handleSpaceClick = (e: React.MouseEvent, position: number) => {
    if (!canEdit()) return
    
    e.preventDefault()
    setIsEditing(true)
    setEditingPosition(position)
    setEditingContent('')
    setOriginalContent('')
  }

  const handleEdit = async (newContent: string) => {
    if (newContent === originalContent) {
      setIsEditing(false)
      return
    }

    if (containsLinks(newContent)) {
      alert('Links are not allowed in the content!')
      setIsEditing(false)
      return
    }

    const beforeText = content.slice(0, editingPosition)
    const afterText = content.slice(editingPosition + originalContent.length)
    // If inserting a new word (originalContent is empty) and there's no
    // whitespace before the insertion point, add a leading space so the
    // new word doesn't stick to the previous one.
    const needsLeadingSpace =
      originalContent.length === 0 &&
      editingPosition > 0 &&
      !/\s/.test(content.charAt(editingPosition - 1)) &&
      newContent.length > 0 &&
      !newContent.startsWith(' ')
    const toInsert = needsLeadingSpace ? ` ${newContent}` : newContent

    // Determine change type
    const changeType = originalContent === '' ? 'insert' : newContent === '' ? 'delete' : 'replace'

    const fullNewContent = beforeText + toInsert + afterText

    try {
      const change = {
        document_id: documentId,
        change_type: changeType,
        content: toInsert,
        position: editingPosition,
        length: originalContent.length,
        user_id: (currentUser?.id && currentUser.id.length === 36) ? currentUser.id : '00000000-0000-0000-0000-000000000000',
        user_name: currentUser?.name || 'Anonymous'
      }

      await updateDocument(documentId, change)

      setContent(fullNewContent)
      setCooldown(new Date(Date.now() + 10000))
      
      // Add your own change to the history immediately
      addChange({
        id: Date.now().toString(),
        user_name: currentUser?.name || 'Anonymous',
        change_type: changeType,
        content: toInsert,
        position: editingPosition,
        length: originalContent.length,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Failed to save change:', error)
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes('links are not allowed')) {
          alert('Links are not allowed in the content!')
        } else if (error.message.toLowerCase().includes('profanity')) {
          alert('Profanity detected. Your change was not applied.')
        }
      }
    }
    
    setIsEditing(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEdit(editingContent)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }

  const renderEditableContent = () => {
    if (!content) {
      return <div className="p-6 text-gray-500">Loading content...</div>
    }

    const parts = []
    let currentPosition = 0
    
    const words = content.split(/(\s+)/)
    
    for (let i = 0; i < words.length; i++) {
      const part = words[i]
      const isWhitespace = /^\s+$/.test(part)
      const partStartPosition = currentPosition
      
      if (isEditing && partStartPosition === editingPosition) {
        parts.push(
          <input
            key={`edit-${partStartPosition}`}
            ref={inputRef}
            type="text"
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onBlur={() => handleEdit(editingContent)}
            onKeyDown={handleKeyPress}
            className="inline-block border border-blue-500 bg-blue-50 px-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ minWidth: `${Math.max(40, editingContent.length * 10 + 20)}px`, width: `${Math.max(40, editingContent.length * 10 + 20)}px` }}
          />
        )
      } else if (isWhitespace) {
        parts.push(
          <span
            key={partStartPosition}
            className={`cursor-pointer hover:bg-yellow-100 text-black ${!canEdit() ? 'cursor-not-allowed opacity-50' : ''}`}
            onClick={(e) => handleSpaceClick(e, partStartPosition)}
          >
            {part}
          </span>
        )
      } else {
        const isHighlighted = highlightedRange && 
          partStartPosition >= highlightedRange.start && 
          partStartPosition < highlightedRange.end
        
        parts.push(
          <span
            key={partStartPosition}
            className={`
              cursor-pointer hover:bg-blue-100 px-0.5 rounded text-black font-medium
              ${!canEdit() ? 'cursor-not-allowed opacity-50' : 'hover:text-blue-700'}
              ${isHighlighted ? 'bg-yellow-200 shadow-sm' : ''}
            `}
            onClick={(e) => handleWordClick(e, partStartPosition, part)}
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
          className={`cursor-pointer hover:bg-yellow-100 inline-block w-2 text-black ${!canEdit() ? 'cursor-not-allowed opacity-50' : ''}`}
          onClick={(e) => handleSpaceClick(e, currentPosition)}
        >
          {' '}
        </span>
      )
    }
    
    return parts
  }


  const renderContent = () => {
    return (
      <div 
        ref={editorRef}
        className="editor-content p-6 text-lg leading-relaxed min-h-full text-black bg-white"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {renderEditableContent()}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}
