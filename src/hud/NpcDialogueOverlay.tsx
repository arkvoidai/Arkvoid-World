import { useEffect, useRef, useState } from 'react';
import { getSupabaseSafe } from '@/net/supabase';

type ChatMessage = { role: 'assistant' | 'user'; content: string };

const RESIDENTS: Record<string, { name: string; title: string; greeting: string }> = {
  meilin: {
    name: 'Meilin',
    title: 'Cloud-Ring Monastery · Sword Disciple',
    greeting: 'The wind is sharp up here. You made the climb—what brings you to the monastery?',
  },
  yue: {
    name: 'Yue',
    title: 'Imperial Plaza · Keeper of the Moon Archive',
    greeting: 'Welcome to the river capital. The city remembers more than its walls suggest. What would you like to know?',
  },
  sylva: {
    name: 'Sylva',
    title: 'World Tree Sanctum · Forest Warden',
    greeting: 'You are a long way from the stone paths. Listen for a moment; the forest is never truly quiet.',
  },
};

export default function NpcDialogueOverlay({
  npcId,
  onClose,
}: {
  npcId: string;
  onClose: () => void;
}) {
  const resident = RESIDENTS[npcId] ?? {
    name: 'Wanderer',
    title: 'Resident of Arkvoid',
    greeting: 'The world is wider than it first appears. What would you like to ask?',
  };
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: resident.greeting },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function sendMessage(): Promise<void> {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    setError(null);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const supabase = getSupabaseSafe();
      if (!supabase) throw new Error('World connection is not configured yet.');
      const { data, error: invokeError } = await supabase.functions.invoke('mistral-npc', {
        body: { npcId, message },
      });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        if (context) {
          const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
          if (payload?.error) throw new Error(payload.error);
        }
        throw invokeError;
      }
      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The resident could not answer just now. Try again in a moment.');
      }
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Conversation service is unavailable.';
      setError(messageText.includes('MISTRAL_API_KEY')
        ? 'The conversation service is waiting for its Mistral API key to be configured.'
        : messageText);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={'Talk with ' + resident.name}
      className="pointer-events-auto fixed inset-x-3 bottom-24 z-overlay mx-auto flex max-h-[min(68vh,620px)] w-auto max-w-[430px] flex-col overflow-hidden rounded-[26px] border border-white/60 bg-[#f8f6f0]/95 text-[#20231f] shadow-[0_24px_90px_rgba(12,18,14,0.28)] backdrop-blur-2xl sm:inset-x-auto sm:right-7 sm:bottom-7"
    >
      <header className="flex items-start justify-between border-b border-[#d8d4c9] px-5 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8b7758]">Arkvoid · Living World</div>
          <h2 className="mt-1 font-serif text-[26px] leading-none">{resident.name}</h2>
          <p className="mt-1.5 text-[11px] tracking-wide text-[#74756d]">{resident.title}</p>
        </div>
        <button
          type="button"
          aria-label="Close conversation"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#d9d5ca] text-lg text-[#6c6d66] transition hover:bg-white"
        >
          ×
        </button>
      </header>

      <div className="min-h-[150px] flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <p className={
              message.role === 'user'
                ? 'max-w-[86%] rounded-[18px] rounded-br-sm bg-[#283d34] px-4 py-3 text-[13px] leading-relaxed text-[#f8f6f0]'
                : 'max-w-[90%] rounded-[18px] rounded-bl-sm border border-[#e3dfd5] bg-white/75 px-4 py-3 text-[13px] leading-relaxed text-[#343830]'
            }>
              {message.content}
            </p>
          </div>
        ))}
        {busy && (
          <p className="px-3 py-2 text-xs italic text-[#77796f]">{resident.name} is thinking…</p>
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="status" className="px-5 pb-2 text-[11px] text-[#9b4b31]">{error}</p>}

      <form
        className="flex items-end gap-2 border-t border-[#d8d4c9] bg-white/45 p-3"
        onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={'Speak with ' + resident.name + '…'}
          className="max-h-24 min-h-11 flex-1 resize-none rounded-[15px] border border-[#dcd8cd] bg-[#fbfaf6] px-3.5 py-3 text-[13px] leading-relaxed outline-none placeholder:text-[#929187] focus:border-[#a98d61]"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="h-11 rounded-[15px] bg-[#283d34] px-4 text-[12px] font-semibold tracking-wide text-white transition hover:bg-[#365648] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
