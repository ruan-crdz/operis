'use client';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Panel, useToast } from '@operis/ui';
import { askAssistant } from '@/client/actions/assistant';
import type { ChatMessage } from '@/server/ai/gateway';
export function AssistantChat({ aiEnabled }: { aiEnabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);
  if (!aiEnabled)
    return (
      <Panel className="panel-pad">
        O assistente de IA está desativado neste escritório. Peça a um administrador para habilitar em
        Configurações → Escritório.
      </Panel>
    );
  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const history = messages;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending(true);
    try {
      const { reply } = await askAssistant(text, history);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'Não foi possível responder agora.',
        'danger',
      );
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setPending(false);
    }
  }
  return (
    <Panel className="panel-pad assistant-chat">
      <div className="assistant-messages">
        {!messages.length && (
          <p className="muted">
            Pergunte sobre um cliente, uma competência, um documento, ou como usar alguma parte do Operis.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`assistant-bubble assistant-bubble-${m.role}`}>
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="assistant-bubble assistant-bubble-assistant assistant-typing" aria-live="polite">
            Pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="input"
          placeholder="Pergunte ao Operis…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={pending}
          aria-label="Mensagem para o assistente"
        />
        <Button type="submit" disabled={pending || !input.trim()} aria-label="Enviar mensagem">
          <Send size={16} />
        </Button>
      </form>
    </Panel>
  );
}
