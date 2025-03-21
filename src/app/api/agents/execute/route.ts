import { NextRequest, NextResponse } from 'next/server';
import { OPENAI_API_KEY, AI_MODEL_TEMPERATURE, AI_MAX_TOKENS } from '@/utils/env';
import agents from '@/config/agents.json';
import { addToMemory, formatConversationHistory } from '@/utils/memory';
import { trackEvent, startTimer, endTimer } from '@/utils/analytics';

// OpenAI API endpoint
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Executes a command using the specified agent
 */
export async function POST(request: NextRequest) {
  try {
    const requestStartTime = startTimer();
    const body = await request.json();
    const { agentId, command } = body;
    
    if (!agentId || !command) {
      return NextResponse.json({ 
        error: 'Missing required fields: agentId and command are required' 
      }, { status: 400 });
    }

    // Find the agent in our configuration
    const agent = agents.agents.find(a => a.id === agentId);
    if (!agent) {
      trackEvent({
        agentId,
        eventType: 'error',
        metadata: { error: `Agent with ID "${agentId}" not found` }
      });
      
      return NextResponse.json({ 
        error: `Agent with ID "${agentId}" not found` 
      }, { status: 404 });
    }

    // Track request event
    trackEvent({
      agentId,
      eventType: 'request',
      metadata: { command }
    });

    const response = await getAgentResponse(agentId, agent, command);
    const totalDuration = endTimer(requestStartTime);

    return NextResponse.json({
      success: true,
      agentId,
      command,
      response,
      metrics: {
        totalDuration
      }
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Error processing command with agent:', error);
    
    // Extract agentId from request if possible, or use 'unknown-agent' if not available
    let agentId = 'unknown-agent';
    try {
      const body = await request.json();
      agentId = body.agentId || 'unknown-agent';
    } catch {}
    
    // Track error
    trackEvent({
      agentId,
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
 * Gets a response from an agent using OpenAI or falls back to simulated response
 */
async function getAgentResponse(agentId: string, agent: any, command: string): Promise<string> {
  try {
    const startTime = startTimer();
    
    // Add the command to agent's memory
    addToMemory(agentId, {
      role: 'user',
      content: command
    });

    // If we don't have an API key, simulate the response
    if (!OPENAI_API_KEY) {
      console.warn('No OpenAI API key found, returning simulated response');
      const simulationStartTime = startTimer();
      const simulatedResponse = simulateAgentResponse(agent, command);
      const simulationDuration = endTimer(simulationStartTime);
      
      // Add the simulated response to memory
      addToMemory(agentId, {
        role: 'agent',
        content: simulatedResponse
      });
      
      // Track simulated response
      trackEvent({
        agentId,
        eventType: 'response',
        duration: simulationDuration,
        metadata: { 
          simulated: true,
          responseLength: simulatedResponse.length,
          command
        }
      });
      
      return simulatedResponse;
    }

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(agentId, 5);

    // Prepare the prompt for the specialized agent
    const prompt = `
You are the ${agent.name} agent. You are specialized in: ${agent.capabilities.join(', ')}.
${agent.description}

Recent conversation history:
${conversationHistory}

Current user command: "${command}"

Please respond to this request based on your specialization. Keep your response relevant to your specific capabilities, and provide a helpful and informative answer.`;

    const apiStartTime = startTimer();
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
            content: `You are the ${agent.name} agent with these capabilities: ${agent.capabilities.join(', ')}. ${agent.description}`
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
    const apiDuration = endTimer(apiStartTime);

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      
      // Track API error
      trackEvent({
        agentId,
        eventType: 'error',
        metadata: { 
          error: 'OpenAI API error',
          details: data,
          command
        }
      });
      
      throw new Error('Failed to get response from OpenAI API');
    }

    const aiResponse = data.choices[0].message.content.trim();
    const totalDuration = endTimer(startTime);
    
    // Add the response to memory
    addToMemory(agentId, {
      role: 'agent',
      content: aiResponse
    });
    
    // Track successful response
    trackEvent({
      agentId,
      eventType: 'response',
      duration: totalDuration,
      metadata: { 
        apiDuration,
        responseLength: aiResponse.length,
        command
      }
    });
    
    return aiResponse;
    
  } catch (error) {
    console.error('Error getting agent response, using fallback:', error);
    
    // Track error and fallback to simulation
    trackEvent({
      agentId,
      eventType: 'error',
      metadata: { 
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackToSimulation: true,
        command
      }
    });
    
    // Fall back to a simulated response if the API call fails
    const simulationStartTime = startTimer();
    const simulatedResponse = simulateAgentResponse(agent, command);
    const simulationDuration = endTimer(simulationStartTime);
    
    // Add the fallback response to memory
    addToMemory(agentId, {
      role: 'agent',
      content: simulatedResponse
    });
    
    // Track simulated fallback response
    trackEvent({
      agentId,
      eventType: 'response',
      duration: simulationDuration,
      metadata: { 
        simulated: true,
        fallback: true,
        responseLength: simulatedResponse.length,
        command
      }
    });
    
    return simulatedResponse;
  }
}

/**
 * Simulates a response from an agent when the API is not available
 */
function simulateAgentResponse(agent: any, command: string): string {
  const lowercaseCommand = command.toLowerCase();
  
  // Different responses based on agent type
  switch(agent.id) {
    case 'text-generator':
      if (lowercaseCommand.includes('summary') || lowercaseCommand.includes('summarize')) {
        return `Here's a concise summary as requested: [Simulated summary content based on your request]`;
      } else if (lowercaseCommand.includes('blog') || lowercaseCommand.includes('article')) {
        return `I've drafted a blog post on the topic you requested. This is a simulated response since the OpenAI API is not configured.`;
      } else {
        return `I've generated the text you requested. Note that this is a simulated response since the OpenAI API is not configured.`;
      }
      
    case 'data-processor':
      if (lowercaseCommand.includes('convert') || lowercaseCommand.includes('transformation')) {
        return `I've processed the data format conversion you requested. This is a simulated response.`;
      } else if (lowercaseCommand.includes('validate')) {
        return `I've validated the data structure as requested. This is a simulated response without actual validation.`;
      } else {
        return `I've processed the data according to your specifications. This is a simulated response since the OpenAI API is not configured.`;
      }
      
    case 'decision-maker':
      if (lowercaseCommand.includes('options') || lowercaseCommand.includes('decide') || lowercaseCommand.includes('choice')) {
        return `After analyzing the options, I recommend proceeding with Option A because it offers the best balance of risk and reward. Note that this is a simulated response.`;
      } else if (lowercaseCommand.includes('risk')) {
        return `I've assessed the risks involved and identified three key factors to consider: [simulated risk factors]. This is a simulated response.`;
      } else {
        return `Based on your criteria, I've made a recommendation for your decision. This is a simulated response since the OpenAI API is not configured.`;
      }
      
    case 'script-launcher':
      if (lowercaseCommand.includes('run') || lowercaseCommand.includes('execute') || lowercaseCommand.includes('launch')) {
        return `I've prepared the script for execution. This is a simulated response without actual script execution.`;
      } else if (lowercaseCommand.includes('schedule')) {
        return `I've scheduled the task to run at the specified time. This is a simulated response without actual scheduling.`;
      } else {
        return `I've set up the automation task as requested. This is a simulated response since the OpenAI API is not configured.`;
      }
      
    default:
      return `I've processed your request as the ${agent.name} agent. This is a simulated response since the OpenAI API is not configured.`;
  }
} 