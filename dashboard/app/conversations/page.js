'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, CLINIC_ID } from '../../lib/supabase';

const ROLE_LABELS = { user: 'مريض', assistant: 'الذكاء الاصطناعي', tool: 'أداة', system: 'نظام' };

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
  const searchParams             = useSearchParams();
  const [patients,  setPatients] = useState([]);
  const [selected,  setSelected] = useState(searchParams.get('phone') || null);
  const [messages,  setMessages] = useState([]);
  const [convState, setConvState] = useState(null);   // conversation_state row
  const [loadingP,  setLoadingP] = useState(true);
  const [loadingM,  setLoadingM] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast,     setToast]    = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Load patient sidebar list ─────────────────────────────────────────────
  const loadPatients = useCallback(async () => {
    setLoadingP(true);
    const { data } = await supabase
      .from('conversations')
      .select('patient_phone, created_at')
      .eq('clinic_id', CLINIC_ID)
      .order('created_at', { ascending: false });

    if (data) {
      const map = new Map();
      for (const row of data) {
        if (!map.has(row.patient_phone)) map.set(row.patient_phone, row.created_at);
      }
      setPatients([...map.entries()].map(([phone, ts]) => ({ phone, ts })));
    }
    setLoadingP(false);
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // ── Load messages + state for selected patient ────────────────────────────
  const loadMessages = useCallback(async (phone) => {
    if (!phone) return;
    setLoadingM(true);

    const [msgRes, stateRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, role, content, tool_calls, created_at, message_type')
        .eq('clinic_id', CLINIC_ID)
        .eq('patient_phone', phone)
        .order('created_at', { ascending: true }),
      supabase
        .from('conversation_state')
        .select('state, state_data, last_message_at')
        .eq('clinic_id', CLINIC_ID)
        .eq('patient_phone', phone)
        .maybeSingle(),
    ]);

    setMessages(msgRes.data || []);
    setConvState(stateRes.data || null);
    setLoadingM(false);
  }, []);

  useEffect(() => {
    if (selected) loadMessages(selected);
    else { setMessages([]); setConvState(null); }
  }, [selected, loadMessages]);

  // ── Realtime: new messages ────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    const ch = supabase
      .channel('conv-rt-' + selected)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `clinic_id=eq.${CLINIC_ID}` },
        (payload) => {
          if (payload.new.patient_phone === selected) {
            setMessages((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [selected]);

  // ── Reset conversation state to 'active' ──────────────────────────────────
  async function handleReset() {
    if (!selected) return;
    if (!confirm(`إعادة تشغيل محادثة ${selected}؟\nسيتمكن البوت من الرد مجدداً.`)) return;

    setResetting(true);
    const { error } = await supabase
      .from('conversation_state')
      .update({ state: 'active', state_data: {} })
      .eq('clinic_id', CLINIC_ID)
      .eq('patient_phone', selected);

    if (error) {
      showToast('فشل إعادة التشغيل: ' + error.message, 'error');
    } else {
      setConvState((prev) => prev ? { ...prev, state: 'active', state_data: {} } : null);
      showToast('تم إعادة تشغيل المحادثة ✅ — البوت جاهز للرد', 'success');
    }
    setResetting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const stateConf = convState ? (STATE_LABELS[convState.state] || STATE_LABELS.active) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">💬 المحادثات</h1>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-200px)]">

        {/* ── Patient sidebar ─────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-2xl overflow-y-auto shadow-sm">
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
                className={`w-full text-right px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  selected === phone ? 'bg-blue-50 border-r-2 border-r-blue-500' : ''
                }`}
              >
                <p className="font-mono text-xs text-gray-800 truncate">{phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtTime(ts)}</p>
              </button>
            ))
          )}
        </div>

        {/* ── Messages panel ──────────────────────────────────────────────── */}
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">
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
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-gray-700">{selected}</span>
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
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {resetting ? '...' : '🔄 إعادة تشغيل البوت'}
                  </button>
                )}

                {/* Also allow reset for 'resolved' */}
                {convState?.state === 'resolved' && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
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
  const isTool      = msg.role === 'tool';

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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      <div className="max-w-xs md:max-w-md lg:max-w-lg">
        <p className="text-xs text-gray-400 mb-1 px-1">
          {ROLE_LABELS[msg.role] || msg.role} · {fmtTime(msg.created_at)}
        </p>
        <div className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
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
