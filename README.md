# Multi-Agent System

A modular, scalable platform for AI-driven multi-agent architecture.

## Features

- **Mother Agent**: Central coordinator that delegates tasks to specialized agents
- **Specialized Agents**: Purpose-built agents with unique capabilities
- **Memory System**: Persistent conversation history across agent interactions
- **Analytics Dashboard**: Track performance metrics and usage statistics
- **OpenAI Integration**: Uses AI for intelligent task delegation and agent responses

## Analytics System

The Analytics system provides comprehensive monitoring of agent performance and usage across the multi-agent architecture:

### Key Features:

- **Event Tracking**: Monitors requests, responses, errors, and delegations for each agent
- **Performance Metrics**: Displays average response times, success rates, and usage counts
- **Visual Dashboard**: Interactive UI with tables and charts for data visualization
- **Agent Comparison**: Compare performance across different agents
- **Data Management**: Reset analytics data for individual agents or the entire system

### How to Use:

1. Access the Analytics Dashboard at `/analytics`
2. View system-wide metrics at the top of the dashboard
3. Examine detailed agent-specific metrics in the Agent Performance table
4. Compare response times visually in the Response Time Comparison chart
5. Reset analytics data using the reset buttons when needed

### Implementation:

The analytics system is composed of:

- **Analytics Utility (`src/utils/analytics.ts`)**: Core functionality for tracking and managing analytics data
- **API Integration**: Both Mother Agent and specialized agent APIs track events automatically
- **Dashboard Component**: Visual representation of analytics data

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set environment variables in `.env.local`:
   ```
   OPENAI_API_KEY=your_openai_api_key
   AI_MODEL=gpt-3.5-turbo
   AI_MAX_TOKENS=150
   AI_TEMPERATURE=0.7
   ```
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Key URLs

- Home: [http://localhost:3000](http://localhost:3000)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Mother Agent: [http://localhost:3000/mother-agent](http://localhost:3000/mother-agent)
- Analytics: [http://localhost:3000/analytics](http://localhost:3000/analytics)
- Memory: [http://localhost:3000/memory](http://localhost:3000/memory)
- Individual Agents: [http://localhost:3000/agent/[id]](http://localhost:3000/agent/[id])

## Environment Variables

The following environment variables can be configured in your `.env.local` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models | - |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | - |
| `STABILITY_AI_KEY` | Stability AI key for image generation | - |
| `HUGGINGFACE_API_KEY` | HuggingFace API key | - |
| `GOOGLE_AI_API_KEY` | Google AI API key | - |
| `AI_MODEL_TEMPERATURE` | Temperature setting for AI models | 0.7 |
| `AI_MAX_TOKENS` | Maximum tokens for AI responses | 1024 |
| `API_REQUEST_TIMEOUT` | Timeout for API requests (ms) | 30000 |

## Available Agents

1. **Text Generator**: Generate creative text based on prompts
2. **Data Processor**: Process and transform JSON and MDX data
3. **Decision Maker**: AI-driven decision making based on inputs
4. **Script Launcher**: Launch scripts and automate tasks

## Adding New Agents

To add a new agent, modify the `src/config/agents.json` file with your agent's details:

```json
{
  "id": "your-agent-id",
  "name": "Your Agent Name",
  "description": "Description of what your agent does",
  "category": "your-category",
  "version": "1.0.0",
  "config": {
    // Agent-specific configuration
  },
  "capabilities": [
    // List of capabilities
  ]
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Next.js
- React
- Tailwind CSS
- Cursor IDE
