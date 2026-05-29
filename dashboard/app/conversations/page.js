'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useClinicId } from '../../hooks/useClinicId';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

const ROLE_LABELS = { user: 'مريض', assistant: 'الذكاء الاصطناعي', tool: 'أداة', system: 'نظام', doctor: 'الطبيب' };

const STATE_LABELS = {
  active:          { label: 'نشط',            color: 'bg-green-100 text-green-700'  },
  awaiting_human:  { label: 'ينتظر موظف',    color: 'bg-orange-100 text-orange-700' },
  resolved:        { label: 'محلول',          color: 'bg-gray-100 text-gray-500'    },
};

function fmtTime(iso) {
  return new Date(iso).toLocaleString('ar-IQ', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">جار التحميل...</div>}>
      <ConversationsContent />
    </Suspense>
  );
}

function ConversationsContent() {
  const { clinicId, loading: clinicLoading, error: clinicError } = useClinicId();

  const searchParams             = useSearchParams();
  const [patients,  setPatients] = useState([]);
  const [selected,  setSelected] = useState(searchParams.get('phone') || null);
  const [messages,  setMessages] = useState([]);
  const [convState, setConvState] = useState(null);   // conversation_state row
  const [loadingP,  setLoadingP] = useState(true);
  const [loadingM,  setLoadingM] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast,     setToast]    = useState(null);
  const [draftMsg,  setDraftMsg] = useState('');
  const [sending,   setSending]  = useState(false);
  const messagesEndRef           = useRef(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Load patient sidebar list ─────────────────────────────────────────────
  const loadPatients = useCallback(async () => {
    if (!clinicId) return;
    setLoadingP(true);
    const { data } = await supabase
      .from('conversations')
      .select('patient_phone, created_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (data) {
      const map = new Map();
      for (const row of data) {
        if (!map.has(row.patient_phone)) map.set(row.patient_phone, row.created_at);
      }
      setPatients([...map.entries()].map(([phone, ts]) => ({ phone, ts })));
    }
    setLoadingP(false);
  }, [clinicId]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // ── Load messages + state for selected patient ────────────────────────────
  const loadMessages = useCallback(async (phone) => {
    if (!phone || !clinicId) return;
    setLoadingM(true);

    const [msgRes, stateRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, role, content, tool_calls, created_at, message_type')
        .eq('clinic_id', clinicId)
        .eq('patient_phone', phone)
        .order('created_at', { ascending: true }),
      supabase
        .from('conversation_state')
        .select('state, state_data, last_message_at')
        .eq('clinic_id', clinicId)
        .eq('patient_phone', phone)
        .maybeSingle(),
    ]);

    setMessages(msgRes.data || []);
    setConvState(stateRes.data || null);
    setLoadingM(false);
  }, [clinicId]);

  useEffect(() => {
    if (selected) loadMessages(selected);
    else { setMessages([]); setConvState(null); }
  }, [selected, loadMessages]);

  // ── Realtime: new messages ────────────────────────────────────────────────
  useEffect(() => {
    if (!selected || !clinicId) return;
    const ch = supabase
      .channel('conv-rt-' + selected)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `clinic_id=eq.${clinicId}` },
        (payload) => {
          if (payload.new.patient_phone !== selected) return;
          setMessages((prev) => {
            // Replace the optimistic temp entry if it exists (same content, doctor role)
            if (payload.new.role === 'doctor') {
              const idx = prev.findIndex(
                (m) => typeof m.id === 'string' && m.id.startsWith('temp-') && m.content === payload.new.content
              );
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = payload.new;
                return next;
              }
            }
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [selected, clinicId]);

  // ── Auto-scroll to bottom when messages change ────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Reset conversation state to 'active' ──────────────────────────────────
  async function handleReset() {
    if (!selected) return;
    if (!confirm(`إعادة تشغيل محادثة ${selected}؟\nسيتمكن البوت من الرد مجدداً.`)) return;

    setResetting(true);
    const { error } = await supabase
      .from('conversation_state')
      .update({ state: 'active', state_data: {} })
      .eq('clinic_id', clinicId)
      .eq('patient_phone', selected);

    if (error) {
      showToast('فشل إعادة التشغيل: ' + error.message, 'error');
    } else {
      setConvState((prev) => prev ? { ...prev, state: 'active', state_data: {} } : null);
      showToast('تم إعادة تشغيل المحادثة ✅ — البوت جاهز للرد', 'success');
    }
    setResetting(false);
  }

  // ── Send a doctor message ────────────────────────────────────────────────
  async function handleSend() {
    if (!draftMsg.trim() || !selected || sending) return;

    const msgText = draftMsg.trim();
    const tempId  = 'temp-' + Date.now();

    // Optimistic: show message immediately before API confirms
    setMessages((prev) => [...prev, {
      id:           tempId,
      role:         'doctor',
      content:      msgText,
      created_at:   new Date().toISOString(),
      tool_calls:   null,
      message_type: 'text',
    }]);
    setDraftMsg('');
    setSending(true);

    try {
      const res  = await fetch(`${BACKEND_URL}/api/messages/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clinic_id: clinicId, patient_phone: selected, message: msgText }),
      });
      const data = await res.json();

      if (!data.success) {
        // Roll back optimistic message and restore the draft
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraftMsg(msgText);
        showToast(data.error || 'فشل إرسال الرسالة', 'error');
      }
      // On success: realtime will replace the temp entry with the real DB row
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraftMsg(msgText);
      showToast('فشل إرسال الرسالة', 'error');
    }

    setSending(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const stateConf = convState ? (STATE_LABELS[convState.state] || STATE_LABELS.active) : null;

  if (clinicLoading) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
        <p>جاري التحميل...</p>
      </div>
    );
  }
  if (clinicError) {
    return <div className="text-center py-16 text-red-500">{clinicError}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header — shows back button on mobile when a patient is selected */}
      <div className="flex items-center gap-3">
        {selected && (
          <button
            onClick={() => setSelected(null)}
            aria-label="رجوع للقائمة"
            className="md:hidden flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 text-xl"
          >
            →
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">💬 المحادثات</h1>
      </div>

      {/* Toast — top full-width on mobile, bottom-left on desktop */}
      {toast && (
        <div className={`fixed z-50 text-sm font-medium text-white
          top-0 left-0 right-0 px-4 py-3 text-center
          md:top-auto md:bottom-4 md:left-4 md:right-auto md:rounded-xl md:shadow-lg md:px-5 md:max-w-sm md:text-right
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="md:flex md:gap-4 md:h-[calc(100vh-200px)]">

        {/* ── Patient list — full width on mobile, 256px column on desktop ── */}
        <div className={`
          ${selected ? 'hidden' : 'block'} md:block
          w-full md:w-64 md:flex-shrink-0
          bg-white border border-gray-200 rounded-2xl overflow-y-auto shadow-sm
          h-[calc(100dvh-160px)] md:h-auto
        `}>
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm">
            المرضى ({patients.length})
          </div>
          {loadingP ? (
            <div className="text-center py-8 text-gray-400 text-sm">جاري التحميل...</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">لا توجد محادثات</div>
          ) : (
            patients.map(({ phone, ts }) => (
              <button
                key={phone}
                onClick={() => setSelected(phone)}
                className={`w-full text-right px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors min-h-[44px] ${
                  selected === phone ? 'bg-blue-50 border-r-2 border-r-blue-500' : ''
                }`}
              >
                <p className="font-mono text-xs text-gray-800 break-all">{phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtTime(ts)}</p>
              </button>
            ))
          )}
        </div>

        {/* ── Messages panel — full width on mobile when selected ─────────── */}
        <div className={`
          ${selected ? 'flex' : 'hidden'} md:flex
          flex-col flex-1
          bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm
          h-[calc(100dvh-160px)] md:h-auto
        `}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-2">👈</p>
                <p>اختر مريضاً من القائمة</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Mobile back button inside panel */}
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="رجوع"
                    className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] text-gray-500 hover:text-gray-800 text-lg"
                  >
                    ←
                  </button>
                  <span className="font-mono text-sm text-gray-700 break-all">{selected}</span>
                  <span className="text-xs text-gray-400">{messages.length} رسالة</span>
                  {/* Conversation state badge */}
                  {stateConf && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${stateConf.color}`}>
                      {stateConf.label}
                    </span>
                  )}
                </div>

                {/* Reset button — shown when state is awaiting_human */}
                {convState?.state === 'awaiting_human' && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {resetting ? '...' : '🔄 إعادة تشغيل البوت'}
                  </button>
                )}

                {/* Also allow reset for 'resolved' */}
                {convState?.state === 'resolved' && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {resetting ? '...' : '🔄 إعادة تفعيل البوت'}
                  </button>
                )}
              </div>

              {/* Awaiting-human banner */}
              {convState?.state === 'awaiting_human' && (
                <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700 flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">⚠️</span>
                  <div>
                    <p className="font-semibold">البوت متوقف — المحادثة بانتظار موظف بشري</p>
                    {convState.state_data?.reason && (
                      <p className="text-xs mt-0.5 text-orange-600">السبب: {convState.state_data.reason}</p>
                    )}
                    <p className="text-xs mt-1 text-orange-500">
                      اضغط "إعادة تشغيل البوت" بعد الانتهاء من مساعدة المريض
                    </p>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingM ? (
                  <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">لا توجد رسائل</div>
                ) : (
                  messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
                )}
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Doctor message input ──────────────────────────────────── */}
              <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
                <input
                  type="text"
                  value={draftMsg}
                  onChange={(e) => setDraftMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  placeholder="اكتب رسالة..."
                  disabled={sending}
                  dir="rtl"
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 min-h-[44px]"
                />
                <button
                  onClick={handleSend}
                  disabled={!draftMsg.trim() || sending}
                  aria-label="إرسال"
                  className="flex-shrink-0 flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser      = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';
  const isDoctor    = msg.role === 'doctor';
  const isTool      = msg.role === 'tool';
  const isOptimistic = typeof msg.id === 'string' && msg.id.startsWith('temp-');

  if (isTool) {
    const toolInfo = msg.tool_calls?.[0];
    let result = msg.content;
    try { result = JSON.stringify(JSON.parse(msg.content), null, 2); } catch (_) {}
    return (
      <div className="mx-2 my-1">
        <div className="bubble-tool px-3 py-2 rounded-xl max-w-2xl overflow-x-auto">
          <p className="text-gray-500 mb-1">🔧 {toolInfo?.name || 'tool'}</p>
          <pre className="whitespace-pre-wrap break-all text-xs">{result}</pre>
        </div>
        <p className="text-xs text-gray-400 mt-1 px-1">{fmtTime(msg.created_at)}</p>
      </div>
    );
  }

  const isVoice = msg.message_type === 'voice';

  // Alignment: user (patient) → right; assistant/doctor → left
  const alignEnd = isUser;

  // Bubble style class
  const bubbleClass = isUser
    ? 'bubble-user'
    : isDoctor
    ? 'bubble-doctor'
    : 'bubble-assistant';

  return (
    <div className={`flex ${alignEnd ? 'justify-end' : 'justify-start'} gap-2 ${isOptimistic ? 'opacity-70' : ''}`}>
      <div className="max-w-xs md:max-w-md lg:max-w-lg">
        <p className="text-xs text-gray-400 mb-1 px-1">
          {ROLE_LABELS[msg.role] || msg.role} · {fmtTime(msg.created_at)}
        </p>
        <div className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${bubbleClass}`}>
          {isVoice && <span className="mr-1">🎤</span>}
          {msg.content || <span className="opacity-50 italic">[فارغ]</span>}
          {isVoice && (
            <p className="text-xs mt-1 opacity-50">رسالة صوتية</p>
          )}
          {isAssistant && msg.tool_calls?.length > 0 && (
            <p className="text-xs mt-1 opacity-60">
              🔧 {msg.tool_calls.map((t) => t.name).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
