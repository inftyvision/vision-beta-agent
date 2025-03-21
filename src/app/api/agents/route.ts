import { NextResponse } from 'next/server';
import agents from '@/config/agents.json';
import { getConfiguredProviders } from '@/utils/env';

/**
 * GET handler to retrieve the list of agents
 */
export async function GET() {
  try {
    // In a real app, you might filter agents based on configured API keys
    const configuredProviders = getConfiguredProviders();
    
    // For now, we'll just return all agents from the config
    return NextResponse.json({ 
      agents: agents.agents,
      providers: configuredProviders
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
} 