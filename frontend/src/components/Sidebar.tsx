'use client'

import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/stores/useStore'
import { ChevronDownIcon, ChevronRightIcon, HashtagIcon } from '@heroicons/react/24/outline'

interface HeadingNode {
  id: string
  text: string
  level: number
  position: number
  children: HeadingNode[]
}

export default function Sidebar() {
  const { content } = useStore()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const headingTree = useMemo(() => {
    const headings: HeadingNode[] = []
    const stack: HeadingNode[] = []
    
    const lines = content.split('\n')
    let position = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      
      if (match) {
        const level = match[1].length
        const text = match[2].trim()
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        
        const node: HeadingNode = {
          id: id || `heading-${i}`,
          text,
          level,
          position,
          children: []
        }
        
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }
        
        if (stack.length === 0) {
          headings.push(node)
        } else {
          stack[stack.length - 1].children.push(node)
        }
        
        stack.push(node)
      }
      
      position += line.length + 1
    }
    
    return headings
  }, [content])

  useEffect(() => {
    const allIds = new Set<string>()
    const collectIds = (nodes: HeadingNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id)
        collectIds(node.children)
      })
    }
    collectIds(headingTree)
    setExpandedNodes(allIds)
  }, [headingTree])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const scrollToHeading = (position: number) => {
    const editor = document.querySelector('.editor-content')
    if (editor) {
      const textContent = editor.textContent || ''
      const charPosition = Math.min(position, textContent.length)
      
      const range = document.createRange()
      const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null
      )
      
      let currentPos = 0
      let textNode = walker.nextNode()
      
      while (textNode && currentPos + textNode.textContent!.length < charPosition) {
        currentPos += textNode.textContent!.length
        textNode = walker.nextNode()
      }
      
      if (textNode) {
        range.setStart(textNode, Math.max(0, charPosition - currentPos))
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

  const renderNode = (node: HeadingNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children.length > 0
    
    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer rounded text-sm ${
            depth === 0 ? 'font-medium' : ''
          }`}
          style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
          onClick={() => scrollToHeading(node.position)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleNode(node.id)
              }}
              className="mr-1 p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDownIcon className="w-3 h-3" />
              ) : (
                <ChevronRightIcon className="w-3 h-3" />
              )}
            </button>
          ) : (
            <div className="w-4 mr-1" />
          )}
          
          <HashtagIcon className={`w-3 h-3 mr-2 text-gray-400 ${node.level > 3 ? 'opacity-60' : ''}`} />
          
          <span className="truncate flex-1 text-gray-700">
            {node.text}
          </span>
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {headingTree.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <HashtagIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No headings found</p>
            <p className="text-xs mt-1">Add # headings to see outline</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {headingTree.map(node => renderNode(node))}
          </div>
        )}
      </div>
    </aside>
  )
}