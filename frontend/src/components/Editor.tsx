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
  const [showPreview, setShowPreview] = useState(true)
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
      setCooldown(new Date(Date.now() + 10000))
      
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

  const createClickableMarkdown = () => {
    if (!content) return null

    const components = {
      h1: ({ children, ...props }: any) => (
        <h1 className="text-3xl font-bold mt-8 mb-4 cursor-pointer hover:bg-blue-50 p-2 rounded text-black" 
            style={{ color: '#000000' }}
            onClick={() => editSection('h1', children)} {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: any) => (
        <h2 className="text-2xl font-semibold mt-6 mb-3 cursor-pointer hover:bg-blue-50 p-2 rounded text-black" 
            onClick={() => editSection('h2', children)} {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: any) => (
        <h3 className="text-xl font-medium mt-4 mb-2 cursor-pointer hover:bg-blue-50 p-2 rounded text-black" 
            onClick={() => editSection('h3', children)} {...props}>
          {children}
        </h3>
      ),
      p: ({ children, ...props }: any) => (
        <p className="mb-4 leading-relaxed cursor-pointer hover:bg-gray-50 p-2 rounded text-black" 
           onClick={() => editSection('p', children)} {...props}>
          {children}
        </p>
      ),
      ul: ({ children, ...props }: any) => (
        <ul className="mb-4 ml-6 list-disc cursor-pointer hover:bg-gray-50 p-2 rounded text-black" 
            onClick={() => editSection('ul', children)} {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: any) => (
        <ol className="mb-4 ml-6 list-decimal cursor-pointer hover:bg-gray-50 p-2 rounded text-black" 
            onClick={() => editSection('ol', children)} {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }: any) => (
        <li className="mb-1 cursor-pointer hover:bg-blue-50 p-1 rounded text-black" 
            onClick={() => editSection('li', children)} {...props}>
          {children}
        </li>
      ),
      strong: ({ children, ...props }: any) => (
        <strong className="font-bold cursor-pointer hover:bg-yellow-100 px-1 rounded text-black" 
                onClick={() => editSection('strong', children)} {...props}>
          {children}
        </strong>
      ),
      em: ({ children, ...props }: any) => (
        <em className="italic cursor-pointer hover:bg-yellow-100 px-1 rounded text-black" 
            onClick={() => editSection('em', children)} {...props}>
          {children}
        </em>
      ),
      code: ({ children, ...props }: any) => (
        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm cursor-pointer hover:bg-blue-100 text-black" 
              onClick={() => editSection('code', children)} {...props}>
          {children}
        </code>
      ),
      pre: ({ children, ...props }: any) => (
        <pre className="bg-gray-100 p-4 rounded-lg mb-4 overflow-x-auto cursor-pointer hover:bg-blue-50 text-black" 
             onClick={() => editSection('pre', children)} {...props}>
          {children}
        </pre>
      ),
    }

    return (
      <div className="text-black" style={{ color: '#000000' }}>
        <ReactMarkdown components={components}>
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  const editSection = (type: string, children: any) => {
    if (!canEdit()) return
    
    // Find the raw markdown for this section in the content
    const text = typeof children === 'string' ? children : children[0] || ''
    const position = content.indexOf(text)
    
    if (position !== -1) {
      setIsEditing(true)
      setEditingPosition(position)
      setEditingContent(text)
    }
  }

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="p-6">
          <div className="mb-4 text-sm text-gray-600">
            Editing markdown syntax:
          </div>
          <textarea
            ref={inputRef as any}
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onBlur={() => handleEdit(editingContent)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleEdit(editingContent)
              } else if (e.key === 'Escape') {
                setIsEditing(false)
              }
            }}
            className="w-full h-32 p-3 border border-blue-500 bg-blue-50 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            placeholder="Enter markdown syntax..."
          />
          <div className="mt-2 text-xs text-gray-500">
            Press Ctrl+Enter to save, Escape to cancel
          </div>
        </div>
      )
    }

    return (
      <div className="p-6">
        {createClickableMarkdown()}
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