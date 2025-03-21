import { NextRequest, NextResponse } from 'next/server';
import { OPENAI_API_KEY, AI_MODEL_TEMPERATURE, AI_MAX_TOKENS } from '@/utils/env';
import agents from '@/config/agents.json';
import { addToMemory, formatConversationHistory } from '@/utils/memory';
import { trackEvent, startTimer, endTimer } from '@/utils/analytics';

// OpenAI API endpoint
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MOTHER_AGENT_ID = 'mother-agent';

/**
 * Mother Agent API route handler
 * This is the central coordinator that handles all input and delegates to the appropriate agent
 */
export async function POST(request: NextRequest) {
  try {
    const requestStartTime = startTimer();
    const body = await request.json();
    const { command } = body;
    
    if (!command) {
      return NextResponse.json({ 
        error: 'Missing required field: command is required' 
      }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'OpenAI API key is not configured. Please check your .env.local file.' 
      }, { status: 500 });
    }

    // Track request event
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'request',
      metadata: { command }
    });

    // Add user's command to memory
    addToMemory(MOTHER_AGENT_ID, {
      role: 'user',
      content: command
    });

    // First, determine which agent should handle this request
    const delegationStartTime = startTimer();
    const { delegatedAgent, reason } = await determineAppropriateAgent(command);
    const delegationDuration = endTimer(delegationStartTime);
    
    console.log(`Delegating to ${delegatedAgent} because: ${reason}`);

    // Track delegation event
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'delegation',
      duration: delegationDuration,
      metadata: { delegatedTo: delegatedAgent, reason }
    });

    // Get the response from the delegated agent or handle it directly
    const responseStartTime = startTimer();
    const response = await getAgentResponse(delegatedAgent, command);
    const responseDuration = endTimer(responseStartTime);

    // Add agent's response to memory
    addToMemory(MOTHER_AGENT_ID, {
      role: 'agent',
      content: response,
      agentId: delegatedAgent !== MOTHER_AGENT_ID ? delegatedAgent : undefined
    });

    // Track response event
    trackEvent({
      agentId: delegatedAgent,
      eventType: 'response',
      duration: responseDuration,
      metadata: { command, responseLength: response.length }
    });

    // Track overall response for mother agent
    const totalDuration = endTimer(requestStartTime);
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'response',
      duration: totalDuration,
      metadata: { delegatedTo: delegatedAgent, command }
    });

    return NextResponse.json({
      success: true,
      command,
      delegatedAgent,
      reason,
      response,
      metrics: {
        totalDuration,
        delegationDuration,
        responseDuration
      }
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Error processing command with mother agent:', error);
    
    // Track error event
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'error',
      metadata: { 
        error: error.message || 'Unknown error',
        stack: error.stack
      }
    });
    
    return NextResponse.json({
      error: error.message || 'Failed to process command'
    }, { status: 500 });
  }
}

/**
 * Determines which agent should handle a given command
 */
async function determineAppropriateAgent(command: string): Promise<{delegatedAgent: string, reason: string}> {
  try {
    const availableAgents = agents.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities || []
    }));

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(MOTHER_AGENT_ID, 5);

    const prompt = `
You are a "Mother Agent" that coordinates between different specialized agents. Based on the user's command, determine which agent would be best suited to handle it.

Available agents:
${availableAgents.map(agent => `- ${agent.name} (${agent.id}): ${agent.description}
  Capabilities: ${agent.capabilities.join(', ')}`).join('\n\n')}

Recent conversation history:
${conversationHistory}

Current user command: "${command}"

Analyze the command and select the most appropriate agent. Consider the conversation history for context.
If none of the specialized agents are well-suited, choose to handle it directly.
Respond in JSON format with fields "agent" (the agent ID, or "mother-agent" if you'll handle it directly) and "reason" (a brief explanation of your choice).
`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a coordination system that determines which specialized agent should handle a request.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: AI_MODEL_TEMPERATURE,
        max_tokens: 200
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return { delegatedAgent: MOTHER_AGENT_ID, reason: 'Failed to determine appropriate agent due to API error' };
    }

    // Parse the response to get the recommended agent
    const content = data.choices[0].message.content.trim();
    
    // This handles the case where the response is directly in JSON format
    if (content.startsWith('{') && content.endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        return { 
          delegatedAgent: parsed.agent, 
          reason: parsed.reason 
        };
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
      }
    }
    
    // Fallback to regex parsing if JSON parsing fails
    const agentMatch = content.match(/"agent"\s*:\s*"([^"]+)"/);
    const reasonMatch = content.match(/"reason"\s*:\s*"([^"]+)"/);
    
    if (agentMatch && reasonMatch) {
      return {
        delegatedAgent: agentMatch[1],
        reason: reasonMatch[1]
      };
    }

    // If we couldn't extract the agent, default to the mother agent
    return { delegatedAgent: MOTHER_AGENT_ID, reason: 'Handling directly as coordination agent' };
    
  } catch (error) {
    console.error('Error determining appropriate agent:', error);
    return { delegatedAgent: MOTHER_AGENT_ID, reason: 'Error occurred, defaulting to mother agent' };
  }
}

/**
 * Gets a response from the specified agent
 */
async function getAgentResponse(agentId: string, command: string): Promise<string> {
  // If it's the mother agent, handle it directly
  if (agentId === MOTHER_AGENT_ID) {
    return await getMotherAgentResponse(command);
  }

  // For specialized agents, add the command to their memory
  addToMemory(agentId, {
    role: 'user',
    content: command
  });

  // Track the request to the specialized agent
  trackEvent({
    agentId,
    eventType: 'request',
    metadata: { command, requestedBy: MOTHER_AGENT_ID }
  });

  // For specialized agents, use the real execute API
  try {
    // Find the agent in our configuration
    const agent = agents.agents.find(a => a.id === agentId);
    if (!agent) {
      trackEvent({
        agentId,
        eventType: 'error',
        metadata: { error: `Agent with ID "${agentId}" not found` }
      });
      return `I couldn't find an agent with ID "${agentId}". Let me answer your query directly instead.`;
    }

    // Create the base URL considering we're running in a server environment
    const currentDomain = process?.env?.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000';
    const apiUrl = new URL('/api/agents/execute', currentDomain).toString();
    
    const apiStartTime = startTimer();
    // Call the execute API for the specialized agent
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        agentId, 
        command 
      })
    });
    
    const data = await response.json();
    const apiDuration = endTimer(apiStartTime);
    
    if (response.ok) {
      // Add the agent's response to its memory
      addToMemory(agentId, {
        role: 'agent',
        content: data.response
      });

      // Track successful response
      trackEvent({
        agentId,
        eventType: 'response',
        duration: apiDuration,
        metadata: { 
          success: true,
          responseLength: data.response.length,
          command
        }
      });

      return data.response;
    } else {
      throw new Error(data.error || 'Failed to get response from agent');
    }
  } catch (error: any) {
    console.error(`Error getting response from ${agentId} agent:`, error);
    
    // Track error
    trackEvent({
      agentId,
      eventType: 'error',
      metadata: { 
        error: error.message || 'Unknown error',
        command
      }
    });
    
    // If the API call fails, fall back to the mother agent
    const fallbackResponse = await getMotherAgentResponse(
      `The ${agentId} agent was unavailable to process your request: "${command}". Please answer as best you can.`
    );
    
    return `I tried to get a response from the ${agentId} agent, but encountered an error. Let me answer directly instead.\n\n${fallbackResponse}`;
  }
}

/**
 * Gets a response directly from the mother agent using OpenAI
 */
async function getMotherAgentResponse(command: string): Promise<string> {
  try {
    const startTime = startTimer();
    const availableAgents = agents.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description
    }));

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(MOTHER_AGENT_ID, 5);

    const prompt = `
You are the "Mother Agent" in a multi-agent system, designed to coordinate between specialized agents and respond directly to general queries.

Available agents in the system:
${availableAgents.map(agent => `- ${agent.name}: ${agent.description}`).join('\n')}

Recent conversation history:
${conversationHistory}

Current user command: "${command}"

Please provide a helpful, concise response to this query. Remember that you are the main coordination point for various specialized agents and should be knowledgeable about the system as a whole.
`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are the Mother Agent in a multi-agent system, designed to coordinate between specialized agents and respond directly to general queries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: AI_MODEL_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS
      })
    });

    const data = await response.json();
    const apiDuration = endTimer(startTime);
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      
      // Track error
      trackEvent({
        agentId: MOTHER_AGENT_ID,
        eventType: 'error',
        metadata: { 
          error: 'OpenAI API error',
          details: data,
          command
        }
      });
      
      return 'I apologize, but I encountered an error while processing your request. Please try again later.';
    }

    const responseContent = data.choices[0].message.content.trim();
    
    // Track successful response
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'response',
      duration: apiDuration,
      metadata: { 
        responseLength: responseContent.length,
        command,
        directResponse: true
      }
    });
    
    return responseContent;
    
  } catch (error: any) {
    console.error('Error getting mother agent response:', error);
    
    // Track error
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'error',
      metadata: { 
        error: error.message || 'Unknown error',
        stack: error.stack,
        command
      }
    });
    
    return `I apologize, but I encountered an error while processing your request: ${error.message}. Please try again later.`;
  }
} 