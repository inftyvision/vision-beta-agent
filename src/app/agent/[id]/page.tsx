import { notFound } from 'next/navigation';
import AgentInteraction from '@/components/AgentInteraction';

// This is a server component that passes the agent ID to the client component
export default function AgentPage({ params }: { params: { id: string } }) {
  // Valid agent IDs
  const validAgentIds = ['text-generator', 'data-processor', 'decision-maker', 'script-launcher'];
  
  // If the agent ID is not valid, return a 404
  if (!validAgentIds.includes(params.id)) {
    return notFound();
  }
  
  return <AgentInteraction agentId={params.id} />;
} 