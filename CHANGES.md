# مساهمات المستخدم — الانتقال من localStorage إلى الـ Backend مع إمكانية الإشراف

## المشكلة
كانت مساهمات المستخدم (إضافة خط لمحطة، أو ميزة على مسار) تُخزَّن محلياً فقط في
`localStorage` تحت المفتاح `mwasalat.userContributions.v1`، فلا تصل إلى الخادم
ولا يمكن للمشرفين الاطلاع عليها أو الموافقة عليها أو رفضها.

## الحل (دون كسر الكود الحالي)
تمت إضافة موارد Backend جديدة، وتحويل تخزين الـ frontend إلى **كاش محلي**
بدلاً من مصدر الحقيقة، مع الإبقاء على نفس توقيع الدوال المستخدمة من قبل
الـ dialogs والصفحات.

### Backend (NestJS + Prisma)
- جدول جديد `user_contributions` (انظر الترحيل
  `backend/prisma/migrations/20260524100000_user_contributions/migration.sql`).
- نموذج Prisma `UserContribution` مع enums `UserContributionType` /
  `UserContributionStatus`، وعلاقات FK اختيارية إلى `tenants` و`users`.
- وحدة `ContributionsModule` تعرض ثلاث نقاط:
  - `POST /contributions` — مفتوحة (مع توثيق اختياري)، تستخدم
    `OptionalJwtAuthGuard` + `OptionalTenantContextGuard`، فيتم تحديد الـ tenant
    من الترويسة `X-Tenant-Slug` أو الـ subdomain، وتسجيل المستخدم إن كان موقّعاً.
  - `GET /contributions` — للمراجعين (`viewer..tenant_owner`) مع فلاتر
    `status` / `type` / `stationId` / `lineId`.
  - `PATCH /contributions/:id/status` — للموافقة/الرفض من
    `ops_manager / tenant_admin / tenant_owner`، وتسجل
    `reviewerId` و `reviewedAt` و `reviewNote`.
- `OptionalJwtAuthGuard` جديد يُلتقط فيه الـ JWT إن وُجد ولا يرفض الطلب
  المجهول (يُمرَّر `req.user = null`).

### Frontend
- `src/modules/shared/services/userContributions.ts`:
  - نفس التواقيع القديمة للدوال
    (`addStationLineContribution`, `addRouteFeatureContribution`,
    `listUserContributions`, …) محافظَة عليها كما هي، مع الإبقاء على
    الكتابة الفورية إلى `localStorage` ليبقى الـ UX المتفائل دون تغيير.
  - بعد الكتابة المحلية، يُرسَل الطلب في الخلفية إلى `POST /contributions`
    (fire-and-forget). عند النجاح يتم تحديث القيد المحلي بـ
    `_serverId` و `_syncState: "synced"` وتُطلق نفس الحدث
    `mwasalat:user-contributions-changed` ليُعاد render.
  - دوال جديدة:
    - `retryPendingContributions()` — لإعادة محاولة الإرسال للقيود التي لم
      تُزامَن بعد. تُستدعى مرة عند إقلاع التطبيق من `src/main.tsx`.
    - `fetchModeratedContributions()` و `updateContributionStatus()` —
      للاستهلاك من واجهة المراجعة في لوحة الإدارة.
- `src/main.tsx`: استيراد ديناميكي لـ `retryPendingContributions` بعد
  تسجيل الـ service worker لتفريغ الطابور المحلي بدون إثقال الإقلاع.

### بدون كسر للكود
- لم يُلمَس أي ملف من المستهلكين الحاليين (`AddStationLineDialog`،
  `AddRouteFeatureDialog`، `useUserContributions`، `RoutePage`،
  `StationPage`).
- `ContributionStatus` تم توسيعها فقط بإضافة قيم جديدة
  (`approved | rejected | applied`)، والواجهة الحالية لا تفلتر على
  `status` فلن يتأثر العرض.
- في حال غياب `VITE_API_BASE_URL` (مثل بيئات Lovable preview) تعمل النسخة
  بنفس السلوك القديم: الكتابة المحلية فقط، ولا أعطال شبكة في الكونسول.

## ما تبقى للنشر الفعلي
- تشغيل `pnpm prisma migrate deploy` على بيئة الـ staging/production لإنشاء
  جدول `user_contributions`.
- (اختياري) إضافة صفحة إدارة جديدة في `src/pages/admin/AdminContributions.tsx`
  تستهلك `fetchModeratedContributions` / `updateContributionStatus` لعرض
  الطابور للمشرفين — البنية التحتية للـ API جاهزة.
