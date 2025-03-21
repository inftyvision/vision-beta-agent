'use client';

import { useState, useEffect, useRef } from 'react';
import agents from '@/config/agents.json';
import { trackEvent } from '@/utils/analytics';
import { addToMemory, getMemory, clearMemory } from '@/utils/memory';

interface Message {
  role: 'user' | 'agent';
  content: string;
  agentId?: string;
  responseTime?: number;
}

export default function SimpleChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string>('mother-agent');
  
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
      const storedMessages = getMemory('all-agents', 100).map(item => ({
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
          content: `Hello! I'm the Mother Agent. How can I help you today?`,
          agentId: 'mother-agent'
        };
        setMessages([welcomeMessage]);
        
        // Store welcome message in memory
        addToMemory('all-agents', {
          role: 'agent',
          content: welcomeMessage.content,
          agentId: 'mother-agent'
        });
      }
    };
    
    loadConversationHistory();
    
    // Focus input field
    inputRef.current?.focus();
  }, []);

  const getCurrentAgentName = (): string => {
    if (currentAgent === 'mother-agent') return 'Mother Agent';
    const agent = agents.agents.find(a => a.id === currentAgent);
    return agent ? agent.name : currentAgent;
  };

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
      agentId: currentAgent,
      eventType: 'request',
      metadata: { command: userMessage.content, source: 'simple-chat' }
    });
    
    try {
      let endpoint = '/api/mother-agent';
      let payload: any = { command: userMessage.content };
      
      if (currentAgent !== 'mother-agent') {
        endpoint = '/api/agents/execute';
        payload = { 
          agentId: currentAgent,
          command: userMessage.content
        };
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }
      
      // Track successful response
      const requestDuration = performance.now() - requestStartTime;
      trackEvent({
        agentId: currentAgent,
        eventType: 'response',
        duration: requestDuration,
        metadata: { 
          command: userMessage.content, 
          responseLength: data.response.length,
          source: 'simple-chat'
        }
      });
      
      const agentResponse = {
        role: 'agent' as const,
        content: data.response || 'No response received',
        agentId: data.delegatedAgent || currentAgent,
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
        agentId: currentAgent,
        eventType: 'error',
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          command: userMessage.content,
          source: 'simple-chat'
        }
      });
      
      const errorMessage = { 
        role: 'agent' as const, 
        content: 'Sorry, I encountered an error while processing your request.',
        agentId: currentAgent
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

  const switchAgent = (agentId: string) => {
    if (currentAgent === agentId) return;
    
    // Track agent switch
    trackEvent({
      agentId,
      eventType: 'request',
      metadata: { 
        source: 'simple-chat', 
        action: 'agent-switch',
        previousAgent: currentAgent
      }
    });
    
    const switchMessage = {
      role: 'agent' as const,
      content: `You're now chatting with the ${agentId === 'mother-agent' ? 'Mother Agent' : 
        agents.agents.find(a => a.id === agentId)?.name || agentId}.`,
      agentId: agentId
    };
    
    // Add a switch notification to the UI
    setMessages(prev => [...prev, switchMessage]);
    
    // Store the switch message in memory
    addToMemory('all-agents', {
      role: 'agent',
      content: switchMessage.content,
      agentId: switchMessage.agentId
    });
    
    setCurrentAgent(agentId);
  };

  // Function to export the conversation history
  const exportConversation = () => {
    const conversationText = messages.map(msg => {
      const sender = msg.role === 'user' ? 'User' : 
        msg.agentId === 'mother-agent' ? 'Mother Agent' : 
        agents.agents.find(a => a.id === msg.agentId)?.name || msg.agentId;
        
      return `${sender}: ${msg.content}`;
    }).join('\n\n');
    
    // Create a blob and download link
    const blob = new Blob([conversationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Track export event
    trackEvent({
      agentId: currentAgent,
      eventType: 'request',
      metadata: { 
        source: 'simple-chat', 
        action: 'export-history',
        messageCount: messages.length
      }
    });
  };

  // Function to clear the conversation history
  const clearConversation = () => {
    if (window.confirm('Are you sure you want to clear the chat history? This action cannot be undone.')) {
      // Clear memory
      clearMemory('all-agents');
      
      // Add a fresh welcome message
      const welcomeMessage = {
        role: 'agent' as const,
        content: `Chat history has been cleared. How can I help you today?`,
        agentId: currentAgent
      };
      
      // Update UI
      setMessages([welcomeMessage]);
      
      // Store the welcome message in memory
      addToMemory('all-agents', {
        role: 'agent',
        content: welcomeMessage.content,
        agentId: welcomeMessage.agentId
      });
      
      // Track clear event
      trackEvent({
        agentId: currentAgent,
        eventType: 'request',
        metadata: { 
          source: 'simple-chat', 
          action: 'clear-history'
        }
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header with agent selection */}
      <div className="bg-white shadow p-4 border-b">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-semibold text-gray-800">Multi-Agent Chat</h1>
            <div className="flex space-x-2">
              <button
                onClick={clearConversation}
                className="px-3 py-1 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-md flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
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
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => switchAgent('mother-agent')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentAgent === 'mother-agent' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Mother Agent
            </button>
            
            {agents.agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => switchAgent(agent.id)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentAgent === agent.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {agent.name}
              </button>
            ))}
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
                    : message.content.includes("You're now chatting with")
                      ? 'bg-gradient-to-r from-purple-100 to-indigo-100 border border-indigo-200 text-gray-800'
                      : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {message.content}
                {message.agentId && message.role === 'agent' && (
                  <div className="mt-1 text-xs text-gray-500 flex items-center justify-between">
                    <span className={`${message.content.includes("You're now chatting with") ? 'font-semibold text-indigo-600' : ''}`}>
                      {message.agentId === 'mother-agent' 
                        ? 'Mother Agent'
                        : agents.agents.find(a => a.id === message.agentId)?.name || message.agentId
                      }
                    </span>
                    {message.responseTime && 
                      <span className="ml-2 text-gray-400">
                        {message.responseTime < 1000 
                          ? `${Math.round(message.responseTime)}ms` 
                          : `${(message.responseTime / 1000).toFixed(1)}s`}
                      </span>
                    }
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
            placeholder={`Message ${getCurrentAgentName()}...`}
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