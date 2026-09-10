import type { ChatMessage } from '@/server/ai/gateway';
import { invokeEdge } from '@/client/edge';
export async function askAssistant(message: string, history: ChatMessage[]) {
  const form = new FormData();
  form.set('message', message);
  form.set('history', JSON.stringify(history));
  return invokeEdge<{ reply: string }>('assistant-chat', form);
}
