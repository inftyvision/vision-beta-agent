/**
 * Command Parser Utility
 * 
 * This utility helps detect and parse specific commands in user messages
 * allowing agents to perform structured actions based on command patterns.
 */

export interface ParsedCommand {
  command: string;     // The primary command type (e.g., 'create', 'analyze')
  action?: string;     // Optional specific action
  params: Record<string, string>; // Parameters extracted from the command
}

// Regular expression patterns for different command types
const commandPatterns = {
  // Create a file or document
  create: /^(?:please\s+)?(?:create|make|write)(?:\s+(?:a|an))?\s+(file|document|script|json|html|css|python|typescript|javascript)(?:\s+(?:called|named))?\s+([a-zA-Z0-9._-]+)(?:\s+with\s+content(?:\s*:|:?\s+)(.*)|(.*))?$/i,
  
  // List items (files, agents, etc.)
  list: /^(?:please\s+)?(?:list|show|get)(?:\s+(?:all|my))?\s+(files|documents|scripts|agents|commands|memory)(?:\s+in\s+(.+))?$/i,
  
  // Analyze content
  analyze: /^(?:please\s+)?(?:analyze|examine|parse|process)(?:\s+(?:this|the|my))?\s+(json|text|code|data|file)(?:\s*:|:?\s+)(?:\s+(.+))?$/i,
  
  // Search for content
  search: /^(?:please\s+)?(?:search|find|look)(?:\s+for)?\s+(?:(?:information|data|content)\s+(?:about|on|related\s+to))?\s*([^:]+)(?:\s+in\s+([^:]+))?$/i,
  
  // Schedule an event or task
  schedule: /^(?:please\s+)?(?:schedule|create|book|plan|set\s+up)(?:\s+(?:a|an))?\s+(meeting|event|task|reminder|appointment)(?:\s+(?:called|titled|named))?\s+([^:]+)(?:\s+(?:for|at|on)\s+(.+))?$/i,
  
  // Read a file
  read: /^(?:please\s+)?(?:read|open|show|display|view|get)(?:\s+(?:the|my))?\s+(?:contents?\s+of\s+)?(?:file\s+)?([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)$/i,
  
  // Delete a file
  delete: /^(?:please\s+)?(?:delete|remove|trash)(?:\s+(?:the|my))?\s+(?:file\s+)?([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)$/i
};

/**
 * Detects if a user message contains a structured command
 * and returns a parsed representation of that command
 */
export function detectCommand(message: string): ParsedCommand | null {
  // Check if we have a simple help command
  if (/^(?:help|commands|help with commands|show commands)$/i.test(message.trim())) {
    return {
      command: 'help',
      params: {}
    };
  }
  
  for (const [commandName, pattern] of Object.entries(commandPatterns)) {
    const match = message.trim().match(pattern);
    
    if (match) {
      // Different parsing logic depending on the command type
      switch (commandName) {
        case 'create': {
          const type = match[1].toLowerCase();
          const name = match[2];
          const content = match[3] || match[4] || '';
          return {
            command: 'create',
            params: { type, name, content }
          };
        }
          
        case 'list': {
          const type = match[1].toLowerCase();
          const location = match[2] || '';
          return {
            command: 'list',
            params: { type, location }
          };
        }
          
        case 'analyze': {
          const type = match[1].toLowerCase();
          let content = '';
          let file = '';
          
          // Check if the second capture group looks like a filename
          if (match[2] && /^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/i.test(match[2].trim())) {
            file = match[2].trim();
          } else {
            content = match[2] || '';
          }
          
          return {
            command: 'analyze',
            params: { type, content, file }
          };
        }
          
        case 'search': {
          const query = match[1].trim();
          const source = match[2] || '';
          return {
            command: 'search',
            params: { query, source }
          };
        }
          
        case 'schedule': {
          const type = match[1].toLowerCase();
          const description = match[2].trim();
          const time = match[3] || '';
          return {
            command: 'schedule',
            params: { type, description, time }
          };
        }
          
        case 'read': {
          const filename = match[1].trim();
          return {
            command: 'read',
            params: { filename }
          };
        }
          
        case 'delete': {
          const filename = match[1].trim();
          return {
            command: 'delete',
            params: { filename }
          };
        }
      }
    }
  }
  
  // Try to extract command and parameters from more complex sentences
  const params = extractParameters(message);
  if (params.command) {
    const command = params.command;
    delete params.command;
    return {
      command,
      params
    };
  }
  
  return null;
}

/**
 * Extract key-value pairs from a text string
 */
export function extractParameters(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  
  // Check for command keywords at the start
  const commandMatch = text.match(/^(?:please\s+)?(?:can\s+you\s+)?(create|list|analyze|search|read|delete|schedule)/i);
  if (commandMatch) {
    params.command = commandMatch[1].toLowerCase();
  }
  
  // Look for key-value pairs in format "key: value" or "key=value"
  const keyValuePattern = /(?:^|\s+)([a-z0-9_]+)(?::|=)\s*("[^"]*"|'[^']*'|[^,;\s]+)/gi;
  let match;
  
  while ((match = keyValuePattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    let value = match[2];
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    
    params[key] = value;
  }
  
  // Check for filename pattern
  const filenameMatch = text.match(/\b([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)\b/);
  if (filenameMatch && !params.filename && !params.file) {
    params.filename = filenameMatch[1];
  }
  
  return params;
}

/**
 * Get help text for available commands
 */
export function getCommandHelp(): string {
  return `
## Available Commands

### File Operations
- \`create file [name] with content: [content]\` - Create a new file with the specified content
- \`create [type] [name] with content: [content]\` - Create a document, script, etc.
- \`list files\` - Show all your saved files
- \`read [filename]\` - Display the contents of a file
- \`delete [filename]\` - Remove a file

### Data Processing
- \`analyze json: [json-content]\` - Parse and analyze JSON data
- \`analyze file [filename]\` - Analyze the contents of a file
- \`analyze [type]: [content]\` - Examine data of different types

### Information Retrieval
- \`search for [query]\` - Search for information about a topic
- \`search [query] in [source]\` - Search in a specific source

### Task Management
- \`schedule meeting [description] for [time]\` - Create a calendar event
- \`schedule [type] [description] for [time]\` - Plan different types of activities

### Help
- \`help with commands\` - Show this help message
- \`list commands\` - Show available commands

You can also use natural language to execute these commands, and I'll do my best to understand your intent.`;
} 