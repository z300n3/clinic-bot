# دليل عملية إلغاء المواعيد (Appointment Cancellation Flow)

هذا المستند يوضح بالتفصيل آلية وكيفية سير عملية إلغاء الموعد من قِبل المريض عبر تطبيق الواتساب (WhatsApp Bot)، والملفات والخطوات البرمجية المسؤولة عن ذلك في النظام.

---

## 🗺️ مخطط تدفق العملية (Mermaid Sequence Diagram)

يوضح المخطط التالي تسلسل تفاعل المريض مع البوت لإتمام عملية إلغاء الموعد:

```mermaid
sequenceDiagram
    autonumber
    actor Patient as المريض
    participant Bot as البوت (webhook)
    participant Extract as extract.js (DeepSeek)
    participant Decide as decide.js
    participant Execute as execute.js
    database DB as Supabase Database

    Patient->>Bot: "أريد إلغاء موعدي"
    Bot->>Extract: تحليل الرسالة واستخراج النية
    Extract-->>Bot: إرجاع { intent: "cancellation" }
    Bot->>Decide: اتخاذ القرار بناءً على النية والحالة الحالية (idle)
    Decide-->>Bot: إرجاع { action: "CONFIRM_CANCEL" }
    Bot->>Execute: تنفيذ الإجراء CONFIRM_CANCEL
    Note over Execute: تنبيه: يجب حفظ حالة الانتظار هنا
    Execute-->>Patient: "تأكد إنك تريد إلغاء موعدك القادم؟ (نعم / لا)"

    Note over Patient, Bot: مرحلة التأكيد من قِبل المريض
    Patient->>Bot: "نعم"
    Bot->>Extract: تحليل الرد
    Extract-->>Bot: إرجاع { intent: "confirmation" }
    Bot->>Decide: اتخاذ القرار (الحالة: awaiting_cancel_confirm)
    Decide-->>Bot: إرجاع { action: "DO_CANCEL" }
    Bot->>Execute: تنفيذ الإجراء DO_CANCEL
    Execute->>DB: تحديث حالة الموعد إلى (cancelled) وحفظ وقت الإلغاء
    DB-->>Execute: تم التحديث بنجاح
    Execute->>DB: إعادة تعيين حالة المحادثة إلى active/idle
    Execute-->>Patient: "تم إلغاء موعدك بنجاح ✅"
```

---

## ⚙️ التفاصيل التفصيلية لخطوات الإلغاء

تتم عملية إلغاء الموعد عبر أربع مراحل أساسية يمر بها خط الأنابيب (Pipeline) في البوت:

### 1. استخراج نية الإلغاء (Intent Extraction)
* **الملف المسؤول:** [extract.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/extract.js)
* **الآلية:**
  عندما يرسل المريض رسالة مثل "أريد إلغاء الحجز"، يتم إرسال الرسالة إلى نموذج الذكاء الاصطناعي (DeepSeek) عبر البرومبت المحدد لتصنيف نية المريض.
  يقوم النموذج بتحليل الرسالة ومطابقتها وتصنيف النية كـ `"cancellation"`.

---

### 2. اتخاذ القرار المبدئي (Decision Making)
* **الملف المسؤول:** [decide.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/decide.js)
* **الآلية:**
  يستقبل الملف النية المستخرجة (`cancellation`). وبما أن الحالة الحالية للمحادثة هي الحالة الافتراضية، يتم اتخاذ القرار التالي:
  ```javascript
  if (intent === 'cancellation')
    return { action: 'CONFIRM_CANCEL' };
  ```

---

### 3. طلب التأكيد والتنفيذ (Execution)
* **الملف المسؤول:** [execute.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/execute.js)
* **الآلية:**
  عندما يكون الإجراء هو `CONFIRM_CANCEL` يقوم البوت بإرسال رسالة التأكيد للمريض:
  > "تأكد إنك تريد إلغاء موعدك القادم؟ (نعم / لا)"

---

### 4. معالجة رد المريض (نعم أو لا)
يتصرف البوت بناءً على إجابة المريض كالتالي:

#### أ. إذا أجاب المريض بـ "نعم":
1. يتم استخراج النية في [extract.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/extract.js) كـ `confirmation` (يتم ذلك عبر المسار السريع Fast-path في السطور 15-19 دون استهلاك توكنز الذكاء الاصطناعي).
2. في [decide.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/decide.js)، يتم فحص الحالة الحالية. إذا كانت `awaiting_cancel_confirm` يتم اتخاذ الإجراء `DO_CANCEL`:
   ```javascript
   if (intent === 'confirmation') {
     if (currentState === 'awaiting_cancel_confirm')
       return { action: 'DO_CANCEL', data: stateData };
   }
   ```
3. في [execute.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/execute.js)، يتم تنفيذ الإجراء `DO_CANCEL` كالتالي:
   * جلب بيانات المريض باستخدام رقم الهاتف.
   * البحث عن أول موعد قادم حالته `scheduled` أو `confirmed` وتاريخه في المستقبل.
   * تحديث حالة الموعد في جدول `appointments` بقاعدة البيانات إلى `cancelled` وتسجيل وقت الإلغاء في حقل `cancelled_at`.
   * إعادة تعيين حالة المحادثة في جدول `conversation_state` لإعادتها للوضع الطبيعي.
   * إرسال رسالة للمريض: `"تم إلغاء موعدك بنجاح ✅"`.

#### ب. إذا أجاب المريض بـ "لا":
1. يتم تصنيف النية كـ `rejection` (عبر المسار السريع Fast-path).
2. في [decide.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/decide.js)، يتم إرجاع إجراء `CANCEL_FLOW`.
3. في [execute.js](file:///c:/Users/Abo%20Elias/medical/clinic-bot/backend/src/agent/execute.js)، يتم مسح حالة الانتظار وإرسال الرسالة للمريض:
   > `"تمام، موعدك محجوز كما هو 👍"`.

---

## ⚠️ تنبيه وملاحظة برمجية هامة (وجود خلل برميجي حالي)

> [!WARNING]
> **خلل في تحديث الحالة (State Update Bug):**
> حالياً في الكود، عند تنفيذ إجراء `CONFIRM_CANCEL` في ملف `execute.js` (السطر 90)، يقوم البوت بإرسال نص التأكيد فقط **دون** تحديث حالة المحادثة في جدول `conversation_state` إلى `awaiting_cancel_confirm`.
>
> هذا يعني أن حالة المحادثة في قاعدة البيانات تظل `active` أو `idle` ولا تتحول إلى حالة انتظار التأكيد. وبالتالي، عندما يكتب المريض "نعم"، يفشل البوت في معرفة السياق في ملف `decide.js` ويرد برسالة `"ما فهمت طلبك. تكدر توضح شنو تريد؟ 😊"` (إجراء `UNCLEAR`).

### 🛠️ الحل البرمجي المقترح لإصلاح المشكلة:
يجب تحديث حالة الانتظار في `execute.js` داخل حالة `CONFIRM_CANCEL` قبل إرسال الرسالة، لتصبح كالتالي:

```diff
     case 'CONFIRM_CANCEL':
+      await upsertConversationState(clinic.id, patientPhone, 'active', {
+        booking_substate: 'awaiting_cancel_confirm'
+      });
       return 'تأكد إنك تريد إلغاء موعدك القادم؟ (نعم / لا)';
```
