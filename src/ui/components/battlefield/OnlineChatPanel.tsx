import { useEffect, useRef, useState } from 'react';
import { Eye, MessageSquare, Send, X } from 'lucide-react';
import {
  onlineService,
  type OnlineChatMessage,
  type OnlineRole,
} from '../../../services/onlineService';

interface OnlineChatPanelProps {
  roomCode: string;
  senderName: string;
  messages: OnlineChatMessage[];
  spectatorCount: number;
  onMessagesUpdated: (messages: OnlineChatMessage[]) => void;
  onClose: () => void;
}

const QUICK_REACTIONS = ['¡ORA!', '¡MUDA!', 'Yare Yare...', '¡Nani?!', '¡Buena jugada!', 'GG!'];

function getRoleMeta(role: OnlineRole): { label: string; badgeClass: string; nameClass: string } {
  if (role === 'P1') {
    return {
      label: 'J1',
      badgeClass: 'bg-[#f2c12e] text-[#0b090e]',
      nameClass: 'text-[#f2c12e]',
    };
  }
  if (role === 'P2') {
    return {
      label: 'J2',
      badgeClass: 'bg-[#e6194b] text-white',
      nameClass: 'text-rose-300',
    };
  }
  return {
    label: 'ESP',
    badgeClass: 'bg-[#00b87c] text-[#0b090e]',
    nameClass: 'text-[#00e599]',
  };
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function OnlineChatPanel({
  roomCode,
  senderName,
  messages,
  spectatorCount,
  onMessagesUpdated,
  onClose,
}: OnlineChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await onlineService.sendChatMessage(roomCode, senderName, text);
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onMessagesUpdated(res.chatMessages);
    setDraft('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendText(draft);
  };

  return (
    <div className="jojo-panel flex h-full flex-col overflow-hidden bg-[#100c17]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-[#060508] bg-[#191326] px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-[#f2c12e]" />
          <span className="font-jojo-heading text-xs tracking-[0.18em] text-[#f5efe0] uppercase">
            CHAT · SALA {roomCode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {spectatorCount > 0 && (
            <span
              title={`${spectatorCount} espectador(es) viendo`}
              className="inline-flex items-center gap-1 border border-[#060508] bg-[#00b87c]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#00e599]"
            >
              <Eye size={11} /> {spectatorCount}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar chat"
            className="border border-[#060508] bg-[#241c33] p-1 text-zinc-300 hover:bg-[#e6194b] hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-zinc-500">
            <MessageSquare size={22} className="opacity-40" />
            <p className="font-jojo-heading text-[11px] tracking-widest uppercase">
              Sin mensajes todavía
            </p>
            <p className="text-[11px]">Saluda a tu rival o usa una reacción rápida.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const roleMeta = getRoleMeta(msg.senderRole);
            return (
              <div
                key={msg.id}
                className="border border-white/10 bg-[#171222] px-2.5 py-1.5 shadow-[2px_2px_0_#060508]"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`border border-[#060508] px-1 py-0.2 font-mono text-[9px] font-black uppercase ${roleMeta.badgeClass}`}
                    >
                      {roleMeta.label}
                    </span>
                    <span className={`truncate font-bold ${roleMeta.nameClass}`}>
                      {msg.senderName}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-500">
                    {formatTime(msg.sentAt)}
                  </span>
                </div>
                <p className="break-words text-zinc-100 leading-snug">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Quick JoJo Reactions */}
      <div className="flex flex-wrap gap-1 border-t border-white/10 bg-[#140f1e] px-2.5 py-1.5">
        {QUICK_REACTIONS.map((reaction) => (
          <button
            key={reaction}
            type="button"
            disabled={sending}
            onClick={() => void sendText(reaction)}
            className="border border-[#060508] bg-[#231b32] px-2 py-0.5 font-jojo-heading text-[10px] tracking-wider text-[#f2c12e] uppercase hover:bg-[#f2c12e] hover:text-[#0b090e] disabled:opacity-40"
          >
            {reaction}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-t border-[#e6194b]/40 bg-[#2a0c16] px-2.5 py-1 text-[10px] font-bold text-rose-200">
          {error}
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 border-t-2 border-[#060508] bg-[#191326] p-2"
      >
        <input
          type="text"
          maxLength={240}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 border-2 border-[#060508] bg-[#0e0b14] px-2.5 py-1.5 text-xs text-[#f5efe0] placeholder:text-zinc-500 focus:border-[#f2c12e] focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          aria-label="Enviar mensaje"
          className="jojo-btn-primary inline-flex items-center justify-center px-3 py-1.5 disabled:opacity-35"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
