'use client';

import { useState, useEffect, useRef } from 'react';
import { trackEvent } from '@/utils/analytics';
import { addToMemory, getMemory } from '@/utils/memory';

interface AgentInteractionProps {
  agentId: string;
}

interface Message {
  role: 'user' | 'agent';
  content: string;
  agentId?: string;
  responseTime?: number;
}

export default function AgentInteraction({ agentId }: AgentInteractionProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize chat with welcome message and load message history
  useEffect(() => {
    // Load past conversation from memory
    const loadConversationHistory = () => {
      // Get both agent-specific messages and all-agents messages
      const storedMessages = getMemory('all-agents', 100)
        .filter(item => !item.agentId || item.agentId === agentId)
        .map(item => ({
          role: item.role,
          content: item.content,
          agentId: item.agentId
        }));
      
      if (storedMessages.length > 0) {
        setMessages(storedMessages);
      } else {
        // Add initial welcome message if no history exists
        const welcomeMessage: Message = {
          role: 'agent',
          content: `Hello! I'm the ${agentId} agent. How can I help you today?`,
          agentId: agentId
        };
        setMessages([welcomeMessage]);
        
        // Store welcome message in memory
        addToMemory('all-agents', {
          role: 'agent',
          content: welcomeMessage.content,
          agentId: agentId
        });
      }
    };
    
    loadConversationHistory();
    
    // Focus input field
    inputRef.current?.focus();
  }, [agentId]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage = { role: 'user' as const, content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    // Store user message in memory
    addToMemory('all-agents', {
      role: 'user',
      content: userMessage.content
    });
    
    // Start tracking request
    const requestStartTime = performance.now();
    trackEvent({
      agentId,
      eventType: 'request',
      metadata: { command: userMessage.content, source: 'agent-interaction' }
    });
    
    try {
      const response = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          command: userMessage.content
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }
      
      // Track successful response
      const requestDuration = performance.now() - requestStartTime;
      trackEvent({
        agentId,
        eventType: 'response',
        duration: requestDuration,
        metadata: { 
          command: userMessage.content, 
          responseLength: data.response?.length || 0,
          source: 'agent-interaction'
        }
      });
      
      const agentResponse = {
        role: 'agent' as const,
        content: data.response || 'No response received',
        agentId: agentId,
        responseTime: requestDuration
      };
      
      // Store agent response in memory
      addToMemory('all-agents', {
        role: 'agent',
        content: agentResponse.content,
        agentId: agentResponse.agentId
      });
      
      setMessages(prev => [...prev, agentResponse]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Track error
      trackEvent({
        agentId,
        eventType: 'error',
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          command: userMessage.content,
          source: 'agent-interaction'
        }
      });
      
      const errorMessage = { 
        role: 'agent' as const, 
        content: 'Sorry, I encountered an error while processing your request.',
        agentId: agentId
      };
      
      // Store error message in memory
      addToMemory('all-agents', {
        role: 'agent',
        content: errorMessage.content,
        agentId: errorMessage.agentId
      });
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Function to export the conversation history
  const exportConversation = () => {
    const conversationText = messages.map(msg => {
      const sender = msg.role === 'user' ? 'User' : `${agentId} Agent`;
      return `${sender}: ${msg.content}`;
    }).join('\n\n');
    
    // Create a blob and download link
    const blob = new Blob([conversationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentId}-chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Track export event
    trackEvent({
      agentId,
      eventType: 'request',
      metadata: { 
        source: 'agent-interaction', 
        action: 'export-history',
        messageCount: messages.length
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header with agent name */}
      <div className="bg-white shadow p-4 border-b">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-semibold text-gray-800">{agentId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Agent</h1>
            <button
              onClick={exportConversation}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          </div>
        </div>
      </div>
      
      {/* Chat container */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg px-4 py-3 shadow-sm ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {message.content}
                {message.agentId && message.role === 'agent' && message.responseTime && (
                  <div className="mt-1 text-xs text-gray-500 flex items-center justify-end">
                    <span className="text-gray-400">
                      {message.responseTime < 1000 
                        ? `${Math.round(message.responseTime)}ms` 
                        : `${(message.responseTime / 1000).toFixed(1)}s`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 max-w-[80%] shadow-sm">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Input area */}
      <div className="bg-white border-t p-4">
        <div className="max-w-3xl mx-auto flex">
          <textarea
            ref={inputRef}
            className="flex-1 border border-gray-300 rounded-l-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-800"
            placeholder={`Message ${agentId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Agent...`}
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
} 