'use client';

import React, { useState, useRef, useEffect } from 'react';
import agents from '@/config/agents.json';
import { trackEvent } from '@/utils/analytics';
import { addToMemory, getMemory, clearMemory } from '@/utils/memory';
import { IoSend } from 'react-icons/io5';
import { FaSpinner } from 'react-icons/fa';
import { AiOutlineClear } from 'react-icons/ai';
import { FiDownload } from 'react-icons/fi';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'mother' | 'agent';
  agentId?: string;
  agentName?: string;
  timestamp: Date;
  context?: any;
}

interface AgentOption {
  id: string;
  name: string;
  description: string;
}

export default function SimpleChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  
  // Format agents data for selection
  const agentOptions: AgentOption[] = [
    { id: 'mother-agent', name: 'Mother Agent', description: 'The main coordination agent' },
    ...agents.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description
    }))
  ];

  // Scroll to bottom of messages when new messages are added
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // If no agent is selected or Mother Agent is selected, use the mother agent
      if (!selectedAgentId || selectedAgentId === 'mother-agent') {
        // Send request to mother agent API
        const response = await fetch('/api/mother-agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command: input })
        });

        if (!response.ok) {
          throw new Error('Failed to send message to mother agent');
        }

        const data = await response.json();
        
        if (data.delegatedAgent) {
          // Mother agent has delegated to another agent
          const motherResponse: Message = {
            id: Date.now().toString() + '-mother',
            content: `I'm delegating this request to the ${data.delegatedAgent} agent because: ${data.reason}`,
            sender: 'mother',
            timestamp: new Date(),
            context: data.context || {}
          };
          setMessages(prev => [...prev, motherResponse]);
          
          // Now get response from the delegated agent
          const agentResponse = await fetch('/api/agents/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              agentId: data.delegatedAgent,
              command: input,
              context: data.context || {}
            })
          });
          
          if (!agentResponse.ok) {
            throw new Error('Failed to get response from delegated agent');
          }
          
          const agentData = await agentResponse.json();
          
          // Add the agent's response to chat
          const agentMessage: Message = {
            id: Date.now().toString() + '-agent',
            content: agentData.response,
            sender: 'agent',
            agentId: data.delegatedAgent,
            agentName: agentOptions.find(a => a.id === data.delegatedAgent)?.name || data.delegatedAgent,
            timestamp: new Date(),
            context: data.context || {}
          };
          setMessages(prev => [...prev, agentMessage]);
        } else {
          // Mother agent has responded directly
          const motherResponse: Message = {
            id: Date.now().toString() + '-mother',
            content: data.response,
            sender: 'mother',
            timestamp: new Date(),
            context: data.context || {}
          };
          setMessages(prev => [...prev, motherResponse]);
        }
      } else {
        // Direct request to specific agent
        const agentResponse = await fetch('/api/agents/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            agentId: selectedAgentId,
            command: input
          })
        });
        
        if (!agentResponse.ok) {
          throw new Error('Failed to get response from agent');
        }
        
        const agentData = await agentResponse.json();
        
        // Add the agent's response to chat
        const agentMessage: Message = {
          id: Date.now().toString() + '-agent',
          content: agentData.response,
          sender: 'agent',
          agentId: selectedAgentId,
          agentName: agentOptions.find(a => a.id === selectedAgentId)?.name || selectedAgentId,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, agentMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message to chat
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        content: 'Sorry, there was an error processing your request. Please try again.',
        sender: 'mother',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const downloadChatHistory = () => {
    // Format chat history as text
    const chatText = messages.map(msg => {
      const sender = msg.sender === 'user' 
        ? 'You' 
        : msg.sender === 'mother' 
          ? 'Mother Agent' 
          : `${msg.agentName} Agent`;
      
      const timestamp = msg.timestamp.toLocaleString();
      let text = `[${timestamp}] ${sender}: ${msg.content}`;
      
      // Add context information if available
      if (msg.context && Object.keys(msg.context).length > 0) {
        text += `\nContext: ${JSON.stringify(msg.context, null, 2)}`;
      }
      
      return text;
    }).join('\n\n');
    
    // Create a blob and download
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Multi-Agent Chat</h1>
        <div className="flex space-x-2">
          <button 
            onClick={downloadChatHistory}
            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
            disabled={messages.length === 0}
          >
            <FiDownload className="mr-1" /> Export
          </button>
          <button 
            onClick={clearChat}
            className="p-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
            disabled={messages.length === 0}
          >
            <AiOutlineClear className="mr-1" /> Clear
          </button>
        </div>
      </div>
      
      {/* Agent selection */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
        <label className="block mb-2 text-sm font-medium text-gray-700">
          Select an agent to handle your request:
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {agentOptions.map((agent) => (
            <button
              key={agent.id}
              className={`p-2 text-sm rounded border transition-colors ${
                selectedAgentId === agent.id
                  ? 'bg-blue-100 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setSelectedAgentId(agent.id)}
              title={agent.description}
            >
              {agent.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {selectedAgentId 
            ? `Using: ${agentOptions.find(a => a.id === selectedAgentId)?.name} - ${agentOptions.find(a => a.id === selectedAgentId)?.description}`
            : "Using Mother Agent (default) - will delegate to specialized agents when appropriate"
          }
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto mb-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 my-8">
            <p className="mb-2">No messages yet. Start a conversation!</p>
            <p className="text-sm">Try asking questions like:</p>
            <ul className="text-sm mt-2">
              <li>&quot;Generate a short sci-fi story about robots&quot;</li>
              <li>&quot;Process this JSON data sample&quot;</li>
              <li>&quot;Help me decide which programming language to learn next&quot;</li>
              <li>&quot;Create a script to automate file backups&quot;</li>
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={`mb-4 p-3 rounded-lg shadow-sm ${
                message.sender === 'user' 
                  ? 'bg-blue-50 text-gray-800 border border-blue-100 ml-8' 
                  : message.sender === 'mother' 
                    ? 'bg-purple-50 text-gray-800 border border-purple-100 mr-8' 
                    : 'bg-green-50 text-gray-800 border border-green-100 mr-8'
              }`}
            >
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  {message.sender === 'user' 
                    ? 'You' 
                    : message.sender === 'mother' 
                      ? 'Mother Agent' 
                      : `${message.agentName} Agent`}
                </span>
                <span>{message.timestamp.toLocaleTimeString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.content}</p>
              
              {/* Display context information when available */}
              {message.context && Object.keys(message.context).length > 0 && (
                <div className="mt-2 text-xs bg-white p-2 rounded border border-gray-200 text-gray-800">
                  <div className="font-semibold mb-1">Context Information:</div>
                  <pre className="whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(message.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messageEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="flex items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message here..."
          className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
          disabled={loading}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white p-3 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400"
          disabled={loading || !input.trim()}
        >
          {loading ? <FaSpinner className="animate-spin" /> : <IoSend />}
        </button>
      </form>
    </div>
  );
} 