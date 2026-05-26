-- ============================================================
-- Clinic Bot — Seed Data (test clinic + sample FAQs)
-- ============================================================
-- Replace the placeholder values before running in production:
--   YOUR_PHONE_NUMBER_ID  → Meta phone-number ID for your WhatsApp Business number
--   YOUR_VERIFY_TOKEN     → random string you choose and put in .env META_VERIFY_TOKEN

INSERT INTO clinics (
  id,
  name,
  doctor_name,
  specialty,
  address,
  working_hours,
  appointment_duration_minutes,
  whatsapp_phone_number_id,
  whatsapp_verify_token,
  is_active
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'عيادة النور',
  'د. أحمد الكريمي',
  'طب عام',
  'بغداد، الكرادة، شارع الرشيد، بناية الأطباء، طابق 3، عيادة 305',
  '{
    "sunday":    {"open": "09:00", "close": "17:00", "closed": false},
    "monday":    {"open": "09:00", "close": "17:00", "closed": false},
    "tuesday":   {"open": "09:00", "close": "17:00", "closed": false},
    "wednesday": {"open": "09:00", "close": "17:00", "closed": false},
    "thursday":  {"open": "09:00", "close": "17:00", "closed": false},
    "friday":    {"closed": true},
    "saturday":  {"open": "09:00", "close": "13:00", "closed": false}
  }',
  30,
  'YOUR_PHONE_NUMBER_ID',
  'YOUR_VERIFY_TOKEN',
  true
) ON CONFLICT (id) DO NOTHING;

-- Sample FAQs in Iraqi Arabic
INSERT INTO faqs (clinic_id, question, answer, keywords, is_active) VALUES

(
  '11111111-1111-1111-1111-111111111111',
  'ما هي أوقات عمل العيادة؟',
  'عيادتنا تفتح من الأحد للخميس من الساعة 9 صباحاً حتى 5 مساءً، والسبت من 9 صباحاً حتى 1 ظهراً. يوم الجمعة إجازة رسمية.',
  ARRAY['أوقات','عمل','دوام','فتح','إجازة','ساعات','متى','وقت','مواعيد'],
  true
),

(
  '11111111-1111-1111-1111-111111111111',
  'كيف يمكنني إلغاء أو تغيير موعدي؟',
  'تقدر تلغي موعدك أو تغيره بسهولة من خلال هذه المحادثة. فقط قول "أريد إلغاء موعدي" وسأتولى الأمر فوراً. ونطلب منك الإلغاء قبل 24 ساعة من الموعد لو ممكن.',
  ARRAY['إلغاء','كنسل','تأجيل','تغيير','موعد','حجز','ألغي','تعديل'],
  true
),

(
  '11111111-1111-1111-1111-111111111111',
  'ما هي الخدمات والتخصصات في العيادة؟',
  'عيادتنا متخصصة في طب الأسرة والرعاية الصحية الأولية مع الدكتور أحمد الكريمي. نقدم: الكشف والعلاج للأمراض العامة، متابعة ضغط الدم والسكري، تطعيمات، فحوصات دورية، ووصف الأدوية.',
  ARRAY['خدمات','تخصص','علاج','أمراض','فحص','تطعيم','سكري','ضغط','ماذا','يعالج'],
  true
)

ON CONFLICT DO NOTHING;
