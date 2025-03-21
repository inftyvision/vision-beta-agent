import { NextRequest, NextResponse } from 'next/server';
import { OPENAI_API_KEY, AI_MODEL_TEMPERATURE, AI_MAX_TOKENS } from '@/utils/env';
import agents from '@/config/agents.json';
import { addToMemory, formatConversationHistory } from '@/utils/memory';
import { trackEvent, startTimer, endTimer } from '@/utils/analytics';
import { detectCommand, getCommandHelp } from '@/utils/commandParser';

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

    // Check for special commands (help, commands)
    if (/^(?:show|list|get)?\s*commands(?:\s+help)?$/i.test(command) || 
        /^help(?:\s+with)?\s+commands$/i.test(command)) {
      return NextResponse.json({
        success: true,
        command,
        delegatedAgent: '',
        reason: 'Providing command help',
        context: {},
        response: `Here are the commands you can use with our agents:\n${getCommandHelp()}`,
        metrics: {
          totalDuration: endTimer(requestStartTime),
          delegationDuration: 0,
          responseDuration: 0
        }
      }, { status: 200 });
    }

    // Try to detect structured command patterns
    const parsedCommand = detectCommand(command);
    
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'OpenAI API key is not configured. Please check your .env.local file.' 
      }, { status: 500 });
    }

    // Track request event
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'request',
      metadata: { 
        command,
        parsedCommand: parsedCommand ? parsedCommand.command : null 
      }
    });

    // Add user's command to memory
    addToMemory(MOTHER_AGENT_ID, {
      role: 'user',
      content: command
    });

    // Pass the parsed command (if any) to the delegation function to improve agent selection
    const delegationStartTime = startTimer();
    const { delegatedAgent, reason, context } = await determineAppropriateAgent(command, parsedCommand);
    const delegationDuration = endTimer(delegationStartTime);
    
    console.log(`Delegating to ${delegatedAgent || 'Mother Agent'} because: ${reason}`);
    if (context) {
      console.log('Context info:', context);
    }

    // Track delegation event with command parsing info
    trackEvent({
      agentId: MOTHER_AGENT_ID,
      eventType: 'delegation',
      duration: delegationDuration,
      metadata: { 
        delegatedTo: delegatedAgent || 'Mother Agent', 
        reason,
        contextInfo: context || {},
        commandParsed: !!parsedCommand
      }
    });

    // Get the response from the delegated agent or handle it directly
    const responseStartTime = startTimer();
    const response = await getAgentResponse(delegatedAgent, command, context);
    const responseDuration = endTimer(responseStartTime);

    // Add agent's response to memory
    addToMemory(MOTHER_AGENT_ID, {
      role: 'agent',
      content: response,
      agentId: delegatedAgent ? delegatedAgent : undefined
    });

    // Track response event
    trackEvent({
      agentId: delegatedAgent || MOTHER_AGENT_ID,
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
      metadata: { delegatedTo: delegatedAgent || 'Mother Agent', command }
    });

    return NextResponse.json({
      success: true,
      command,
      delegatedAgent,
      reason,
      context: context || {},
      parsedCommand: parsedCommand || null,
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
async function determineAppropriateAgent(command: string, parsedCommand?: any): Promise<{delegatedAgent: string, reason: string, context?: any}> {
  try {
    // If we have a parsed command, we can often directly determine the appropriate agent
    if (parsedCommand) {
      // Command-to-agent mapping based on command patterns
      const commandAgentMap: Record<string, string> = {
        'create': 'script-launcher',
        'analyze': 'data-processor',
        'search': 'text-generator',
        'list': '',  // Mother agent handles list commands
        'schedule': 'decision-maker'
      };
      
      const commandType = parsedCommand.command;
      const suggestedAgent = commandAgentMap[commandType];
      
      // If we have a clear mapping, use it directly
      if (suggestedAgent) {
        return {
          delegatedAgent: suggestedAgent,
          reason: `Command '${commandType}' is best handled by this specialized agent`,
          context: {
            parsedCommand: parsedCommand,
            commandType: commandType,
            params: parsedCommand.params
          }
        };
      }
    }

    const availableAgents = agents.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities || []
    }));

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(MOTHER_AGENT_ID, 10);

    // Add parsed command info to the prompt if available
    let commandInfo = `Current user command: "${command}"`;
    if (parsedCommand) {
      commandInfo += `\n\nParsed command structure: ${JSON.stringify(parsedCommand, null, 2)}`;
    }
    
    const prompt = `
You are a "Mother Agent" that coordinates between different specialized agents. Based on the user's command and conversation history, determine which agent would be best suited to handle it.

Available agents:
${availableAgents.map(agent => `- ${agent.name} (${agent.id}): ${agent.description}
  Capabilities: ${agent.capabilities.join(', ')}`).join('\n\n')}

Recent conversation history:
${conversationHistory}

${commandInfo}

Analyze the command and select the most appropriate agent. Consider the conversation history for context.
If none of the specialized agents are well-suited, you should set agent to null, indicating you'll handle it directly.
Extract any key information from the command and history that should be passed to the selected agent.
Respond in JSON format with the following fields:
- "agent" (the agent ID, or null if you'll handle it directly)
- "reason" (a brief explanation of your choice)
- "contextInfo" (an object with any extracted parameters, entities, or information that should be passed to the selected agent)
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
            content: 'You are a coordination system that determines which specialized agent should handle a request and extracts key contextual information.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: AI_MODEL_TEMPERATURE,
        max_tokens: 350
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return { delegatedAgent: '', reason: 'Failed to determine appropriate agent due to API error' };
    }

    // Parse the response to get the recommended agent
    const content = data.choices[0].message.content.trim();
    
    // This handles the case where the response is directly in JSON format
    if (content.startsWith('{') && content.endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.agent === null || parsed.agent === 'mother-agent' || parsed.agent === MOTHER_AGENT_ID) {
          // If mother agent should handle it directly, return empty delegatedAgent
          return { 
            delegatedAgent: '', 
            reason: parsed.reason || 'The Mother Agent will handle this request directly',
            context: parsed.contextInfo || {}
          };
        }
        return { 
          delegatedAgent: parsed.agent, 
          reason: parsed.reason,
          context: parsed.contextInfo || {}
        };
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
      }
    }
    
    // Fallback to regex parsing if JSON parsing fails
    const agentMatch = content.match(/"agent"\s*:\s*"([^"]+)"/);
    const reasonMatch = content.match(/"reason"\s*:\s*"([^"]+)"/);
    let contextInfo = {};
    
    try {
      // Try to extract contextInfo as JSON object
      const contextMatch = content.match(/"contextInfo"\s*:\s*(\{[^}]+\})/);
      if (contextMatch && contextMatch[1]) {
        contextInfo = JSON.parse(contextMatch[1]);
      }
    } catch (e) {
      console.error('Failed to parse contextInfo:', e);
    }
    
    if (agentMatch && reasonMatch) {
      const agent = agentMatch[1];
      if (agent === 'mother-agent' || agent === MOTHER_AGENT_ID || agent === 'null' || agent === null) {
        // If mother agent should handle it directly, return empty delegatedAgent
        return {
          delegatedAgent: '',
          reason: reasonMatch[1],
          context: contextInfo
        };
      }
      return {
        delegatedAgent: agent,
        reason: reasonMatch[1],
        context: contextInfo
      };
    }

    // If we couldn't extract the agent, return empty for direct handling
    return { delegatedAgent: '', reason: 'Handling directly as coordination agent' };
    
  } catch (error) {
    console.error('Error determining appropriate agent:', error);
    return { delegatedAgent: '', reason: 'Error occurred, handling directly' };
  }
}

/**
 * Gets a response from the specified agent
 */
async function getAgentResponse(agentId: string, command: string, context?: any): Promise<string> {
  // If it's the mother agent or empty string (meaning no delegation), handle it directly
  if (!agentId || agentId === MOTHER_AGENT_ID) {
    return await getMotherAgentResponse(command, context);
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
    metadata: { 
      command, 
      requestedBy: MOTHER_AGENT_ID,
      context: context || {} 
    }
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
        command,
        context
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
      `The ${agentId} agent was unavailable to process your request: "${command}". Please answer as best you can.`,
      context
    );
    
    return `I tried to get a response from the ${agentId} agent, but encountered an error. Let me answer directly instead.\n\n${fallbackResponse}`;
  }
}

/**
 * Gets a response directly from the mother agent using OpenAI
 */
async function getMotherAgentResponse(command: string, context?: any): Promise<string> {
  try {
    const startTime = startTimer();
    const availableAgents = agents.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities || []
    }));

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(MOTHER_AGENT_ID, 8);

    let contextInfo = '';
    if (context && Object.keys(context).length > 0) {
      contextInfo = `\nExtracted context information: ${JSON.stringify(context, null, 2)}`;
    }

    const prompt = `
You are the "Mother Agent" in a multi-agent system, designed to coordinate between specialized agents and respond directly to general queries.

Available agents in the system:
${availableAgents.map(agent => `- ${agent.name} (${agent.id}): ${agent.description}
  Capabilities: ${agent.capabilities.join(', ')}`).join('\n\n')}

Recent conversation history:
${conversationHistory}${contextInfo}

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