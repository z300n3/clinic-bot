# نمط جلب Clinic ID في لوحة التحكم

## المشكلة

كل صفحة في الداشبورد تحتاج إلى `clinic_id` لتصفية البيانات من Supabase.  
في البداية كان الحل هو تخزين الـ ID في متغير بيئة:

```env
NEXT_PUBLIC_CLINIC_ID=some-static-uuid
```

```js
// lib/supabase.js
export const CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID;
```

**هذا يسبب مشكلة:** بعد إضافة نظام التسجيل، كل عيادة جديدة تحصل على UUID مختلف يُولَّد تلقائياً عند التسجيل. القيمة في `.env` تصبح قديمة ولا تطابق أي عيادة، مما يسبب:

```
insert or update on table "availability_schedules" violates 
foreign key constraint "availability_schedules_clinic_id_fkey"
```

---

## بنية قاعدة البيانات المعنية

```sql
-- جدول العيادات — كل عيادة لها صف واحد
CREATE TABLE clinics (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT,
  auth_user_id UUID REFERENCES auth.users(id),  -- ربط مع Supabase Auth
  ...
);

-- كل جدول آخر يرتبط بالعيادة عبر clinic_id
CREATE TABLE appointments (
  id         UUID PRIMARY KEY,
  clinic_id  UUID REFERENCES clinics(id),
  ...
);

CREATE TABLE patients (
  id         UUID PRIMARY KEY,
  clinic_id  UUID REFERENCES clinics(id),
  ...
);

-- إلخ...
```

---

## الحل: Hook مشترك يجلب الـ ID ديناميكياً

بدلاً من قراءة UUID ثابت من `.env`، نجلبه من قاعدة البيانات بناءً على المستخدم المسجّل حالياً.

### `hooks/useClinicId.js`

```js
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useClinicId() {
  const [clinicId, setClinicId] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    (async () => {
      // 1. اجلب المستخدم المسجّل حالياً من Supabase Auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('غير مسجّل الدخول');
        setLoading(false);
        return;
      }

      // 2. ابحث عن العيادة المرتبطة بهذا المستخدم
      const { data: clinic, error: dbErr } = await supabase
        .from('clinics')
        .select('id')
        .eq('auth_user_id', user.id)  // الربط يكون عبر auth_user_id
        .single();

      if (dbErr || !clinic) {
        setError('لم يتم العثور على العيادة');
        setLoading(false);
        return;
      }

      // 3. خزّن الـ ID وأنهِ التحميل
      setClinicId(clinic.id);
      setLoading(false);
    })();
  }, []);

  return { clinicId, loading, error };
}
```

---

## كيفية الاستخدام في أي صفحة

```js
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useClinicId } from '../../hooks/useClinicId';

export default function AppointmentsPage() {
  // 1. استدعِ الـ Hook
  const { clinicId, loading: clinicLoading, error: clinicError } = useClinicId();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // 2. أضف clinicId كـ dependency في useCallback
  const fetchData = useCallback(async () => {
    if (!clinicId) return;  // انتظر حتى يتوفر الـ ID
    
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId);  // استخدمه هنا
    
    setAppointments(data || []);
    setLoading(false);
  }, [clinicId]);  // clinicId في dependency array

  useEffect(() => { fetchData(); }, [fetchData]);

  // 3. للـ Realtime subscriptions — أضف guard وأدرج clinicId في dependency array
  useEffect(() => {
    if (!clinicId) return;  // لا تشترك قبل معرفة الـ ID
    
    const ch = supabase
      .channel('my-channel')
      .on('postgres_changes',
        { event: '*', table: 'appointments', filter: `clinic_id=eq.${clinicId}` },
        () => fetchData()
      )
      .subscribe();
    
    return () => supabase.removeChannel(ch);
  }, [clinicId, fetchData]);

  // 4. تعامل مع حالة تحميل الـ clinic ID أولاً
  if (clinicLoading) return <div>جاري التحميل...</div>;
  if (clinicError)   return <div>خطأ: {clinicError}</div>;

  // 5. بعدها ابدأ بعرض الصفحة
  return (
    <div>
      {loading ? <p>جاري جلب البيانات...</p> : (
        appointments.map(a => <p key={a.id}>{a.patient_name}</p>)
      )}
    </div>
  );
}
```

---

## القواعد الأساسية

| القاعدة | السبب |
|---------|-------|
| `if (!clinicId) return;` في بداية كل fetch | الـ Hook يبدأ بـ `null`، لا تُرسل query بـ `null` |
| أضف `clinicId` في `useCallback([...deps])` | حتى يتحدث الـ callback عند توفر الـ ID |
| أضف `clinicId` في `useEffect([clinicId, ...])` للـ Realtime | حتى تُنشأ الـ subscription بعد معرفة الـ ID |
| اعرض loading/error قبل الـ render الرئيسي | تجنب عرض صفحة فارغة أو خاطئة |
| لا تستخدم `CLINIC_ID` من `.env` في الكومبوننت | القيمة ثابتة ولا تتطابق مع العيادات المسجّلة ديناميكياً |

---

## تدفق البيانات الكامل

```
تسجيل دخول المستخدم
        │
        ▼
supabase.auth.getUser()  →  { user.id }
        │
        ▼
SELECT id FROM clinics WHERE auth_user_id = user.id
        │
        ▼
clinicId = "abc-123-..."
        │
        ▼
كل الـ queries تستخدم: .eq('clinic_id', clinicId)
كل الـ inserts تستخدم: { clinic_id: clinicId, ... }
كل الـ Realtime filters: `clinic_id=eq.${clinicId}`
```

---

## الملفات التي تستخدم هذا النمط

```
dashboard/
├── hooks/
│   └── useClinicId.js              ← Hook المشترك
├── app/
│   ├── page.js                     ← صفحة اليوم
│   ├── appointments/page.js        ← المواعيد
│   ├── patients/page.js            ← المرضى
│   ├── conversations/page.js       ← المحادثات
│   └── availability/page.jsx       ← جدول الدوام
└── contexts/
    └── RealtimeProvider.js         ← الإشعارات الفورية
```

---

## ملاحظة عن تسجيل عيادة جديدة

عند إنشاء عيادة من صفحة `/register`:

```js
// 1. إنشاء حساب Auth
const { data: authData } = await supabase.auth.signUp({ email, password });
const user = authData.user;

// 2. إنشاء صف في جدول clinics مع ربطه بالـ user
const { data: clinicData } = await supabase
  .from('clinics')
  .insert({
    name:         clinicName,
    auth_user_id: user.id,   // هذا هو الربط الذي يجعل useClinicId يعمل
    ...
  })
  .select('id')
  .single();
```

بفضل `auth_user_id`، في المرة القادمة التي يفتح فيها المستخدم الداشبورد، يجد الـ Hook العيادة الصحيحة تلقائياً.
