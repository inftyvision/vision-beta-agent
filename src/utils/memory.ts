/**
 * Memory utility for storing and retrieving agent conversation history
 */

interface ConversationItem {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  agentId?: string;
}

interface AgentMemory {
  agentId: string;
  conversations: ConversationItem[];
  lastUpdated: Date;
}

// In-memory storage for conversations
// In a production app, this would be stored in a database
let memoryStore: Record<string, AgentMemory> = {};

/**
 * Add a new item to an agent's conversation history
 */
export function addToMemory(agentId: string, item: Omit<ConversationItem, 'timestamp'>): void {
  // Create memory entry for this agent if it doesn't exist
  if (!memoryStore[agentId]) {
    memoryStore[agentId] = {
      agentId,
      conversations: [],
      lastUpdated: new Date()
    };
  }

  // Add the conversation item with timestamp
  memoryStore[agentId].conversations.push({
    ...item,
    timestamp: new Date()
  });

  // Update the lastUpdated time
  memoryStore[agentId].lastUpdated = new Date();
  
  // Limit the size of the conversation history (keep last 100 items)
  if (memoryStore[agentId].conversations.length > 100) {
    memoryStore[agentId].conversations = memoryStore[agentId].conversations.slice(-100);
  }
}

/**
 * Get the conversation history for an agent
 */
export function getMemory(agentId: string, limit = 10): ConversationItem[] {
  // If no memory exists for this agent, return empty array
  if (!memoryStore[agentId]) {
    return [];
  }
  
  // Return the most recent conversations up to the limit
  return memoryStore[agentId].conversations.slice(-limit);
}

/**
 * Format conversation history for use in AI prompts
 */
export function formatConversationHistory(agentId: string, limit = 5): string {
  const memory = getMemory(agentId, limit);
  
  if (memory.length === 0) {
    return 'No previous conversation history.';
  }
  
  return memory.map(item => {
    const role = item.role === 'user' ? 'User' : 'Agent';
    return `${role}: ${item.content}`;
  }).join('\n\n');
}

/**
 * Clear the conversation history for an agent
 */
export function clearMemory(agentId: string): void {
  if (memoryStore[agentId]) {
    memoryStore[agentId].conversations = [];
    memoryStore[agentId].lastUpdated = new Date();
  }
}

/**
 * Get all agent IDs that have conversation history
 */
export function getAllAgentIds(): string[] {
  return Object.keys(memoryStore);
}

/**
 * Get a summary of all agent conversations
 */
export function getMemorySummary(): Array<{agentId: string, messageCount: number, lastUpdated: Date}> {
  return Object.values(memoryStore).map(memory => ({
    agentId: memory.agentId,
    messageCount: memory.conversations.length,
    lastUpdated: memory.lastUpdated
  }));
} 