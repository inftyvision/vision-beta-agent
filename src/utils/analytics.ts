/**
 * Analytics utility for tracking agent usage and performance
 */

interface AgentUsageEvent {
  agentId: string;
  eventType: 'request' | 'response' | 'error' | 'delegation';
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface AgentAnalytics {
  agentId: string;
  totalRequests: number;
  totalResponses: number;
  totalErrors: number;
  totalDelegations: number;
  averageResponseTime: number;
  lastUsed: number | null;
  events: AgentUsageEvent[];
}

// In-memory analytics storage
// In a production app, this would be stored in a database
let analyticsStore: Record<string, AgentAnalytics> = {};

/**
 * Track an agent usage event
 */
export function trackEvent(event: Omit<AgentUsageEvent, 'timestamp'>): void {
  const { agentId, eventType } = event;
  const timestamp = Date.now();
  
  // Initialize analytics for this agent if it doesn't exist
  if (!analyticsStore[agentId]) {
    analyticsStore[agentId] = {
      agentId,
      totalRequests: 0,
      totalResponses: 0,
      totalErrors: 0,
      totalDelegations: 0,
      averageResponseTime: 0,
      lastUsed: null,
      events: []
    };
  }
  
  // Add the event with timestamp
  const fullEvent: AgentUsageEvent = {
    ...event,
    timestamp
  };
  
  analyticsStore[agentId].events.push(fullEvent);
  
  // Update the relevant metrics
  const analytics = analyticsStore[agentId];
  analytics.lastUsed = timestamp;
  
  switch (eventType) {
    case 'request':
      analytics.totalRequests++;
      break;
    case 'response':
      analytics.totalResponses++;
      if (event.duration) {
        // Update average response time
        const totalResponseTime = analytics.averageResponseTime * (analytics.totalResponses - 1);
        analytics.averageResponseTime = (totalResponseTime + event.duration) / analytics.totalResponses;
      }
      break;
    case 'error':
      analytics.totalErrors++;
      break;
    case 'delegation':
      analytics.totalDelegations++;
      break;
  }
  
  // Limit the size of the events array (keep last 100 events)
  if (analytics.events.length > 100) {
    analytics.events = analytics.events.slice(-100);
  }
}

/**
 * Start timing an operation
 */
export function startTimer(): number {
  return Date.now();
}

/**
 * End timing an operation and return the duration in milliseconds
 */
export function endTimer(startTime: number): number {
  return Date.now() - startTime;
}

/**
 * Get analytics for a specific agent
 */
export function getAgentAnalytics(agentId: string): AgentAnalytics | null {
  return analyticsStore[agentId] || null;
}

/**
 * Get analytics for all agents
 */
export function getAllAgentAnalytics(): AgentAnalytics[] {
  return Object.values(analyticsStore);
}

/**
 * Get the most active agents by total requests
 */
export function getMostActiveAgents(limit: number = 5): AgentAnalytics[] {
  return Object.values(analyticsStore)
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, limit);
}

/**
 * Get the average response time across all agents
 */
export function getAverageSystemResponseTime(): number {
  const agents = Object.values(analyticsStore);
  if (agents.length === 0) return 0;
  
  const totalAverageTime = agents.reduce((sum, agent) => sum + agent.averageResponseTime, 0);
  return totalAverageTime / agents.length;
}

/**
 * Reset analytics for an agent
 */
export function resetAgentAnalytics(agentId: string): void {
  if (analyticsStore[agentId]) {
    analyticsStore[agentId] = {
      agentId,
      totalRequests: 0,
      totalResponses: 0,
      totalErrors: 0,
      totalDelegations: 0,
      averageResponseTime: 0,
      lastUsed: null,
      events: []
    };
  }
}

/**
 * Reset all analytics
 */
export function resetAllAnalytics(): void {
  analyticsStore = {};
} 