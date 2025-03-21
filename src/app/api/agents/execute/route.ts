import { NextRequest, NextResponse } from 'next/server';
import { OPENAI_API_KEY, AI_MODEL_TEMPERATURE, AI_MAX_TOKENS } from '@/utils/env';
import agents from '@/config/agents.json';
import { addToMemory, formatConversationHistory } from '@/utils/memory';
import { trackEvent, startTimer, endTimer } from '@/utils/analytics';
import { detectCommand } from '@/utils/commandParser';
import { saveFile, listFiles, readFile, deleteFile } from '@/utils/fileSystem';

// OpenAI API endpoint
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Execute commands with the specialized agents
 */
export async function POST(request: NextRequest) {
  const requestStartTime = startTimer();
  try {
    const body = await request.json();
    const { agentId, command, context } = body;
    
    if (!agentId || !command) {
      trackEvent({
        agentId: agentId || 'unknown',
        eventType: 'error',
        metadata: { error: 'Missing required fields' }
      });
      
      return NextResponse.json({ 
        error: 'Missing required fields: agentId and command are required' 
      }, { status: 400 });
    }

    // Track request
    trackEvent({
      agentId,
      eventType: 'request',
      metadata: { command }
    });

    // Check if a specific parsed command was passed from the Mother Agent
    let parsedCommand = context?.parsedCommand || null;
    
    // If no parsed command in context, try to detect one
    if (!parsedCommand) {
      parsedCommand = detectCommand(command);
    }
    
    // Add the user command to this agent's memory
    addToMemory(agentId, {
      role: 'user',
      content: command
    });

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

    // Handle parsed commands with specialized behavior
    if (parsedCommand) {
      const commandHandlerResult = await handleSpecializedCommand(parsedCommand, agent, context);
      if (commandHandlerResult) {
        // Add the response to the agent's memory
        addToMemory(agentId, {
          role: 'agent',
          content: commandHandlerResult
        });
        
        trackEvent({
          agentId,
          eventType: 'response',
          duration: endTimer(requestStartTime),
          metadata: { 
            command, 
            commandType: parsedCommand.command,
            responseLength: commandHandlerResult.length
          }
        });
        
        return NextResponse.json({
          agentId,
          command,
          response: commandHandlerResult,
          parsedCommand,
          metrics: {
            totalDuration: endTimer(requestStartTime)
          }
        });
      }
    }

    // If no specialized handling or it didn't return a result, use the AI to generate a response
    const aiResponse = await generateAgentResponse(agent, command, context, parsedCommand);
    
    // Add the AI's response to the agent's memory
    addToMemory(agentId, {
      role: 'agent',
      content: aiResponse
    });
    
    // Track successful response
    trackEvent({
      agentId,
      eventType: 'response',
      duration: endTimer(requestStartTime),
      metadata: { 
        command, 
        responseLength: aiResponse.length,
        usedAI: true
      }
    });
    
    return NextResponse.json({
      agentId,
      command,
      response: aiResponse,
      parsedCommand: parsedCommand || null,
      metrics: {
        totalDuration: endTimer(requestStartTime)
      }
    });
    
  } catch (error: any) {
    console.error('Error executing agent command:', error);
    
    // Track error
    let errorAgentId = 'unknown';
    let errorCommand = '';
    
    try {
      const { agentId, command } = await request.clone().json();
      errorAgentId = agentId || 'unknown';
      errorCommand = command || '';
    } catch {
      // Unable to parse request body, use defaults
    }
    
    trackEvent({
      agentId: errorAgentId,
      eventType: 'error',
      metadata: { 
        error: error.message || 'Unknown error',
        command: errorCommand
      }
    });
    
    return NextResponse.json({ 
      error: error.message || 'An error occurred processing your request' 
    }, { status: 500 });
  }
}

/**
 * Handle specialized command types with custom behavior
 */
async function handleSpecializedCommand(parsedCommand: any, agent: any, context: any): Promise<string | null> {
  const { command, action, params } = parsedCommand;
  
  // Handle different command types based on the agent
  switch (agent.id) {
    case 'script-launcher':
      if (command === 'create') {
        const { type, name, content } = params;
        
        // Determine file extension based on type if not provided in name
        let filename = name;
        if (!filename.includes('.')) {
          const extensionMap: Record<string, string> = {
            'script': '.js',
            'file': '.txt',
            'document': '.md',
            'json': '.json',
            'html': '.html',
            'css': '.css',
            'python': '.py',
            'typescript': '.ts',
            'javascript': '.js'
          };
          
          const extension = extensionMap[type.toLowerCase()] || '.txt';
          filename = `${filename}${extension}`;
        }
        
        // Actually save the file
        const result = await saveFile(filename, content || '');
        
        if (result.success) {
          const relativePath = result.path?.replace(process.cwd(), '').replace(/\\/g, '/');
          return `${type.charAt(0).toUpperCase() + type.slice(1)} created successfully:
- Name: ${filename}
- Path: ${relativePath}
- Size: ${Buffer.from(content || '').length} bytes

The file has been saved to your user-files directory. You can access it at ${relativePath}.`;
        } else {
          return `Failed to create ${type}:
- Name: ${filename}
- Error: ${result.error}
- Message: ${result.message}

Please check the filename and content and try again.`;
        }
      } else if (command === 'list') {
        // List files in user-files directory
        const result = await listFiles();
        
        if (result.success && result.files) {
          if (result.files.length === 0) {
            return `No files found in the user-files directory.`;
          }
          
          return `Files in your user-files directory:
${result.files.map(file => `- ${file}`).join('\n')}

Total: ${result.files.length} file(s)`;
        } else {
          return `Failed to list files: ${result.error}`;
        }
      } else if (command === 'read') {
        // Read file command
        const { filename } = params;
        if (!filename) {
          return `Please specify a filename to read.`;
        }
        
        const result = await readFile(filename);
        
        if (result.success && result.content) {
          const ext = filename.split('.').pop()?.toLowerCase();
          
          // Determine if we should show syntax highlighting (for code files)
          const codeFileTypes = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'rb', 'java', 'c', 'cpp', 'cs'];
          const isCodeFile = codeFileTypes.includes(ext || '');
          
          return `File: ${filename}
Path: ${result.path}

${isCodeFile ? '```' + ext + '\n' : ''}${result.content}${isCodeFile ? '\n```' : ''}`;
        } else {
          return `Failed to read file "${filename}": ${result.error || result.message}`;
        }
      } else if (command === 'delete') {
        // Delete file command
        const { filename } = params;
        if (!filename) {
          return `Please specify a filename to delete.`;
        }
        
        const result = await deleteFile(filename);
        
        if (result.success) {
          return `File "${filename}" has been successfully deleted.`;
        } else {
          return `Failed to delete file "${filename}": ${result.error || result.message}`;
        }
      }
      break;
      
    case 'data-processor':
      if (command === 'analyze') {
        const { type, content, file } = params;
        
        // If a file name is provided, read its content instead
        if (file && !content) {
          const fileResult = await readFile(file);
          
          if (fileResult.success && fileResult.content) {
            // Update the content param with the file content
            params.content = fileResult.content;
            
            // If type is not specified, try to determine from file extension
            if (!type) {
              const ext = file.split('.').pop()?.toLowerCase();
              if (ext === 'json') params.type = 'json';
              else if (['txt', 'md'].includes(ext || '')) params.type = 'text';
              else params.type = ext || 'unknown';
            }
          } else {
            return `Failed to read file "${file}": ${fileResult.error || fileResult.message}`;
          }
        }
        
        // Continue with standard analysis based on type
        if (params.type === 'json' && params.content) {
          try {
            // Try to parse the JSON and provide information about it
            const parsedJson = JSON.parse(params.content);
            const keys = Object.keys(parsedJson);
            
            return `JSON Analysis Results:
- Valid JSON structure: Yes
- Number of top-level keys: ${keys.length}
- Keys: ${keys.join(', ')}
- Data types: ${keys.map(k => `${k}: ${typeof parsedJson[k]}`).join(', ')}

This represents a basic analysis of the JSON structure${file ? ` in file "${file}"` : ''}.`;
          } catch (error) {
            return `Invalid JSON provided${file ? ` in file "${file}"` : ''}. Please check the formatting and try again. Error: ${error instanceof Error ? error.message : 'Unknown parsing error'}`;
          }
        }
        
        return `Analysis of ${params.type || 'content'} initiated${file ? ` for file "${file}"` : ''}. In a real implementation, I would process the content and provide detailed analysis.`;
      } else if (command === 'read') {
        // Data processors can also read files
        const { filename } = params;
        if (!filename) {
          return `Please specify a filename to read.`;
        }
        
        const result = await readFile(filename);
        
        if (result.success && result.content) {
          const ext = filename.split('.').pop()?.toLowerCase();
          
          // For data processor, provide additional stats about the file
          const lines = result.content.split('\n').length;
          const chars = result.content.length;
          const words = result.content.split(/\s+/).filter(Boolean).length;
          
          return `File Analysis: ${filename}
Path: ${result.path}

Stats:
- Lines: ${lines}
- Words: ${words}
- Characters: ${chars}
- File type: ${ext || 'unknown'}

Preview:
${result.content.length > 500 ? result.content.substring(0, 500) + '...' : result.content}`;
        } else {
          return `Failed to read file "${filename}": ${result.error || result.message}`;
        }
      }
      break;
      
    case 'decision-maker':
      if (command === 'schedule') {
        const { type, description, time } = params;
        return `${type.charAt(0).toUpperCase() + type.slice(1)} scheduled:
- Description: ${description}
- Time: ${time || 'Not specified'}

I've logged this ${type} for you. In a real implementation, this would be added to your calendar or task list.`;
      }
      break;
      
    case 'text-generator':
      if (command === 'search') {
        const { query, source } = params;
        return `Search results for "${query}"${source ? ` in ${source}` : ''}:

In a real implementation, I would connect to a search API or database to find relevant information about "${query}". For now, this is a simulated response indicating that the search command was properly parsed and recognized.`;
      }
      break;
  }
  
  // Return null if no specialized handling was found or applicable
  return null;
}

/**
 * Generates a response using the AI model based on the agent's configuration
 */
async function generateAgentResponse(agent: any, command: string, context: any, parsedCommand: any): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, using simulated response');
    return `[Agent: ${agent.name}] This is a simulated response. Please configure the OpenAI API key for real AI responses.`;
  }
  
  const model = agent.config?.model || 'gpt-3.5-turbo';
  const temperature = agent.config?.temperature || AI_MODEL_TEMPERATURE;
  const maxTokens = agent.config?.maxTokens || AI_MAX_TOKENS;
  
  // Build a prompt that includes agent-specific information and any context
  let contextInfo = '';
  if (context && Object.keys(context).length > 0) {
    contextInfo = `\nAdditional context: ${JSON.stringify(context, null, 2)}`;
  }
  
  let commandInfo = `User command: ${command}`;
  if (parsedCommand) {
    commandInfo += `\nParsed command: ${JSON.stringify(parsedCommand, null, 2)}`;
  }
  
  const prompt = `
You are ${agent.name}, a specialized AI agent with the following capabilities:
${agent.capabilities.map((cap: string) => `- ${cap}`).join('\n')}

${commandInfo}${contextInfo}

Respond as ${agent.name}, focusing on your specific expertise. Provide a helpful, informative response to the user's command.
`;
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are ${agent.name}, a specialized AI agent focused on ${agent.description}.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.error('OpenAI API error:', data);
    throw new Error(data.error?.message || 'Failed to generate response from OpenAI');
  }
  
  return data.choices[0].message.content.trim();
}

/**
 * Gets a response from an agent using OpenAI or falls back to simulated response
 */
async function getAgentResponse(agentId: string, agent: any, command: string, context?: any): Promise<string> {
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
      const simulatedResponse = simulateAgentResponse(agent, command, context);
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
          command,
          contextUsed: !!context
        }
      });
      
      return simulatedResponse;
    }

    // Get recent conversation history for context
    const conversationHistory = formatConversationHistory(agentId, 5);

    // Format context information if provided
    let contextInfo = '';
    if (context && Object.keys(context).length > 0) {
      contextInfo = `\nAdditional context from Mother Agent: ${JSON.stringify(context, null, 2)}`;
    }

    // Prepare the prompt for the specialized agent
    const prompt = `
You are the ${agent.name} agent. You are specialized in: ${agent.capabilities.join(', ')}.
${agent.description}

Recent conversation history:
${conversationHistory}${contextInfo}

Current user command: "${command}"

Please respond to this request based on your specialization. Keep your response relevant to your specific capabilities, and provide a helpful and informative answer. If context information was provided by the Mother Agent, use it to enhance your response.`;

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
        command,
        contextUsed: !!context
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
    const simulatedResponse = simulateAgentResponse(agent, command, context);
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
        command,
        contextUsed: !!context
      }
    });
    
    return simulatedResponse;
  }
}

/**
 * Simulates a response from an agent when OpenAI API is not available
 */
function simulateAgentResponse(agent: any, command: string, context?: any): string {
  // Generate a contextual prefix if context is provided
  let contextPrefix = '';
  if (context && Object.keys(context).length > 0) {
    contextPrefix = `Using the context information you provided, `;
  }

  // Simulate different responses based on agent type
  switch (agent.id) {
    case 'text-generator':
      return `${contextPrefix}As the Text Generator agent, I've analyzed your request: "${command}". Here's a creative response based on your input. [Simulated Response - OpenAI API not available]`;
    
    case 'data-processor':
      return `${contextPrefix}I've processed the data in your request: "${command}". Here's my structured analysis. [Simulated Response - OpenAI API not available]`;
    
    case 'decision-maker':
      return `${contextPrefix}Based on your request: "${command}", I've evaluated the options and here's my recommendation. [Simulated Response - OpenAI API not available]`;
    
    case 'script-launcher':
      return `${contextPrefix}I've processed your script request: "${command}". Here's how the execution would proceed. [Simulated Response - OpenAI API not available]`;
    
    default:
      return `${contextPrefix}I'm a simulated agent response for: "${command}". In a live environment with an API key, I would provide a more detailed and accurate response. [Simulated Response - OpenAI API not available]`;
  }
} 