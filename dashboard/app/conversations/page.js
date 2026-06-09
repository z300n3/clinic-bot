'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useClinicId } from '../../hooks/useClinicId';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

const ROLE_LABELS = { user: 'مريض', assistant: 'الذكاء الاصطناعي', tool: 'أداة', system: 'نظام', doctor: 'الطبيب' };

const STATE_LABELS = {
  active:          { label: 'نشط',            color: 'bg-green-100 text-green-700'  },
  gate_collecting: { label: 'جمع معلومات',    color: 'bg-blue-100 text-blue-700' },
  doctor_pending:  { label: 'بانتظار الطبيب',  color: 'bg-orange-100 text-orange-700' },
  doctor_active:   { label: 'الطبيب يرد',     color: 'bg-purple-100 text-purple-700' },
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [convState, setConvState] = useState(null);   // conversation_state row
  const [loadingP,  setLoadingP] = useState(true);
  const [loadingM,  setLoadingM] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast,     setToast]    = useState(null);
  const [draftMsg,  setDraftMsg] = useState('');
  const [sending,   setSending]  = useState(false);
  const messagesEndRef           = useRef(null);
  const messagesContainerRef     = useRef(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Load patient sidebar list ─────────────────────────────────────────────
  const loadPatients = useCallback(async () => {
    if (!clinicId) return;
    setLoadingP(true);
    const { data } = await supabase
      .from('patients')
      .select('phone_number, name, last_seen_at')
      .eq('clinic_id', clinicId)
      .order('last_seen_at', { ascending: false });

    if (data) {
      setPatients(data.map(p => ({
        phone: p.phone_number,
        name: p.name,
        ts: p.last_seen_at
      })));
    }
    setLoadingP(false);
  }, [clinicId]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // ── Load messages + state for selected patient ────────────────────────────
  const loadMessages = useCallback(async (phone) => {
    if (!phone || !clinicId) return;
    setLoadingM(true);
    setHasMore(false);

    const [msgRes, stateRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, role, content, tool_calls, created_at, message_type, media_url')
        .eq('clinic_id', clinicId)
        .eq('patient_phone', phone)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('conversation_state')
        .select('state, state_data, last_message_at')
        .eq('clinic_id', clinicId)
        .eq('patient_phone', phone)
        .maybeSingle(),
    ]);

    if (msgRes.data) {
      setHasMore(msgRes.data.length === 30);
      setMessages(() => {
        const uniqueMessages = [];
        const seen = new Set();
        for (const msg of msgRes.data.reverse()) {
          if (!seen.has(msg.id)) {
            seen.add(msg.id);
            uniqueMessages.push(msg);
          }
        }
        return uniqueMessages;
      });
    } else {
      setMessages([]);
    }
    setConvState(stateRes.data || null);
    setLoadingM(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
  }, [clinicId]);

  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0 || !selected || !clinicId) return;
    setLoadingMore(true);
    
    const container = messagesContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;
    const oldestMsg = messages[0];

    const { data } = await supabase
      .from('conversations')
      .select('id, role, content, tool_calls, created_at, message_type, media_url')
      .eq('clinic_id', clinicId)
      .eq('patient_phone', selected)
      .lt('created_at', oldestMsg.created_at)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setHasMore(data.length === 30);
      setMessages(prev => {
        const combined = [...data.reverse(), ...prev];
        const uniqueMessages = [];
        const seen = new Set();
        for (const msg of combined) {
          if (!seen.has(msg.id)) {
            seen.add(msg.id);
            uniqueMessages.push(msg);
          }
        }
        return uniqueMessages;
      });
      
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - oldScrollHeight;
        }
      }, 0);
    }
    setLoadingMore(false);
  };

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
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [selected, clinicId]);

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
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

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
            patients.map(({ phone, name, ts }) => (
              <button
                key={phone}
                onClick={() => setSelected(phone)}
                className={`w-full text-right px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors min-h-[44px] flex flex-col gap-0.5 ${
                  selected === phone ? 'bg-blue-50 border-r-2 border-r-blue-500' : ''
                }`}
              >
                <div className="flex justify-between items-baseline w-full gap-2">
                  <p className="font-semibold text-sm text-gray-800 truncate">{name || 'بدون اسم'}</p>
                  <p className="text-xs text-gray-400 flex-shrink-0">{fmtTime(ts)}</p>
                </div>
                <p className="font-mono text-xs text-gray-500 w-full text-right" dir="ltr">{phone}</p>
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

                {/* Reset button — shown when state is doctor_pending or doctor_active */}
                {(convState?.state === 'doctor_pending' || convState?.state === 'doctor_active' || convState?.state === 'awaiting_human') && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {resetting ? '...' : '🔄 إنهاء تدخل الطبيب'}
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

              {/* Awaiting-human / Doctor Pending banner */}
              {['awaiting_human', 'doctor_pending', 'doctor_active'].includes(convState?.state) && (
                <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700 flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">👨‍⚕️</span>
                  <div className="flex-1">
                    <p className="font-semibold">المحادثة بانتظار تدخل الطبيب</p>
                    
                    {/* Patient Summary Banner from State Data */}
                    {convState?.state_data?.escalation?.summary && (
                      <div className="mt-2 p-2 bg-white/60 rounded border border-orange-100 text-orange-800 whitespace-pre-wrap">
                        {convState.state_data.escalation.summary}
                      </div>
                    )}
                    
                    <p className="text-xs mt-2 text-orange-500">
                      اضغط "إنهاء تدخل الطبيب" بعد الانتهاء للعودة للوضع الآلي
                    </p>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div 
                ref={messagesContainerRef}
                onScroll={(e) => {
                  if (e.target.scrollTop === 0) loadMoreMessages();
                }}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {loadingM ? (
                  <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">لا توجد رسائل</div>
                ) : (
                  <>
                    {loadingMore && <div className="text-center text-xs text-gray-400 py-2">جاري تحميل الرسائل السابقة...</div>}
                    {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                  </>
                )}
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Doctor message input ──────────────────────────────────── */}
              {(() => {
                const lastMsg = convState?.last_message_at ? new Date(convState.last_message_at) : null;
                const hoursSince = lastMsg ? (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60) : Infinity;
                const windowExpired = hoursSince > 24;
                const hoursLeft = Math.max(0, 24 - Math.floor(hoursSince));

                return (
                  <div className="border-t border-gray-100 p-3 flex flex-col gap-2">
                    {/* 24h Indicator */}
                    <div className="flex items-center gap-2 px-1">
                      {windowExpired ? (
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-600"></span>
                          انتهت مدة الرد (أكثر من 24 ساعة)
                        </span>
                      ) : hoursLeft <= 2 ? (
                        <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                          متبقي {hoursLeft} ساعة للرد
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          متبقي {hoursLeft} ساعة
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 items-end">
                      <input
                        type="text"
                        value={draftMsg}
                        onChange={(e) => setDraftMsg(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !windowExpired) { e.preventDefault(); handleSend(); }
                        }}
                        placeholder={windowExpired ? "لا يمكن الإرسال، انتهت المدة المسموحة" : "اكتب رسالة..."}
                        disabled={sending || windowExpired}
                        dir="rtl"
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 min-h-[44px]"
                      />
                      <button
                        onClick={handleSend}
                        disabled={!draftMsg.trim() || sending || windowExpired}
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
                  </div>
                );
              })()}
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
          {msg.message_type === 'image' && msg.media_url && (
            <img src={msg.media_url} alt="مرفق" className="max-w-xs rounded-lg mb-2 object-cover cursor-pointer" />
          )}
          {msg.message_type === 'image' && !msg.media_url && (
            <div className="max-w-xs h-32 bg-gray-200 rounded-lg mb-2 flex items-center justify-center text-gray-500">
              الصورة لم تعد متاحة
            </div>
          )}
          {isVoice && <span className="mr-1">🎤</span>}
          {msg.content || (msg.message_type === 'image' ? '' : <span className="opacity-50 italic">[فارغ]</span>)}
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
