'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function FAQPage() {
  const [faqs, setFaqs] = useState([]);
  const [clinicId, setClinicId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('غير مسجّل الدخول'); setLoading(false); return; }

    const { data: clinic, error: clinicErr } = await supabase
      .from('clinics')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (clinicErr || !clinic) { setError('لم يتم العثور على العيادة'); setLoading(false); return; }
    
    setClinicId(clinic.id);

    const { data: faqsData, error: faqsErr } = await supabase
      .from('faqs')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false });

    if (!faqsErr && faqsData) {
      setFaqs(faqsData);
    }
    setLoading(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    
    if (!question || !answer) {
      setError('يرجى كتابة السؤال والجواب');
      return;
    }

    const keywordArray = keywords.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const payload = {
      clinic_id: clinicId,
      question,
      answer,
      keywords: keywordArray,
      is_active: isActive
    };

    if (isEditing && editingId) {
      const { error: updErr } = await supabase
        .from('faqs')
        .update(payload)
        .eq('id', editingId);
      if (updErr) {
        setError('فشل في تعديل السؤال: ' + updErr.message);
        return;
      }
    } else {
      const { error: insErr } = await supabase
        .from('faqs')
        .insert([payload]);
      if (insErr) {
        setError('فشل في إضافة السؤال: ' + insErr.message);
        return;
      }
    }

    resetForm();
    fetchData();
  }

  async function handleDelete(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذا السؤال؟')) return;
    const { error: delErr } = await supabase.from('faqs').delete().eq('id', id);
    if (!delErr) {
      fetchData();
    } else {
      alert('فشل في الحذف: ' + delErr.message);
    }
  }

  function handleEdit(faq) {
    setIsEditing(true);
    setEditingId(faq.id);
    setQuestion(faq.question || '');
    setAnswer(faq.answer || '');
    setKeywords((faq.keywords || []).join(', '));
    setIsActive(faq.is_active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setIsEditing(false);
    setEditingId(null);
    setQuestion('');
    setAnswer('');
    setKeywords('');
    setIsActive(true);
    setError('');
  }

  if (loading && !clinicId) return <div className="p-4">جاري التحميل...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">💬 الأسئلة الشائعة (FAQ)</h1>
        <p className="text-gray-600 mt-1">أضف الأسئلة الشائعة التي يمكن للبوت الإجابة عليها تلقائياً عند سؤال المرضى.</p>
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      {/* Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4 text-brand-700">
          {isEditing ? '✏️ تعديل السؤال' : '➕ إضافة سؤال جديد'}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السؤال (لكتابته كمرجع لك)</label>
            <input 
              type="text" 
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="مثال: هل تقبلون بطاقات التأمين؟"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">جواب البوت</label>
            <textarea 
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="مثال: نعم، نقبل بطاقات التأمين الخاصة بـ..."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 h-28 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الكلمات الدلالية (افصل بينها بفاصلة)</label>
            <input 
              type="text" 
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="تأمين, بطاقة تأمين, ضمان, شركة"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-right focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow"
              dir="rtl"
            />
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              هذه هي الكلمات التي إذا كتب المريض إحداها أو شيء مشابه لها، سيرسل له البوت هذا الجواب فوراً. اكتب كل الكلمات المحتملة.
            </p>
          </div>
          
          <div className="flex items-center gap-3 pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              <span className="mr-3 text-sm font-medium text-gray-700">تفعيل الجواب</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
            <button 
              type="submit"
              className="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
            >
              {isEditing ? '💾 حفظ التعديلات' : '➕ إضافة السؤال'}
            </button>
            {isEditing && (
              <button 
                type="button"
                onClick={resetForm}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4 pt-4">
        <h2 className="text-xl font-semibold text-gray-800">📋 الأسئلة المضافة ({faqs.length})</h2>
        {faqs.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <p className="text-gray-500">لا توجد أسئلة شائعة مضافة بعد. أضف سؤالك الأول في الأعلى!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {faqs.map(faq => (
              <div key={faq.id} className={`bg-white p-5 rounded-xl shadow-sm border transition-all ${faq.is_active ? 'border-gray-200 hover:border-brand-300' : 'border-red-200 bg-red-50/30'}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold text-lg ${faq.is_active ? 'text-brand-800' : 'text-gray-500 line-through'}`}>
                        {faq.question}
                      </h3>
                      {!faq.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">معطل</span>
                      )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{faq.answer}</p>
                    </div>
                    
                    {faq.keywords && faq.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {faq.keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-1 bg-brand-50 text-brand-700 text-xs rounded-md font-medium border border-brand-100">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button 
                      onClick={() => handleEdit(faq)}
                      className="w-full px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 font-medium transition-colors"
                    >
                      تعديل
                    </button>
                    <button 
                      onClick={() => handleDelete(faq.id)}
                      className="w-full px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm hover:bg-red-100 font-medium transition-colors"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
