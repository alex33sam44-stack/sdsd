# Frontend Freeze Policy

> **الحالة:** الفرونت‑إند **مُجمَّد رسمياً** (FROZEN).
> **Status:** Frontend is **OFFICIALLY FROZEN**.

## ما الذي تم تجميده؟ / What is frozen?

كل ملف داخل النطاق التالي هو جزء من الواجهة المُجمَّدة:

The following scope is part of the frozen surface:

**Directories (recursive):**
- `src/`
- `public/`

**Top-level files:**
- `index.html`
- `vite.config.ts`
- `vitest.config.ts`
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- `tailwind.config.ts`
- `postcss.config.js`
- `components.json`
- `eslint.config.js`
- `capacitor.config.ts`

كل ملف من هذا النطاق له بصمة `SHA-256` محفوظة في `frontend.lock.json`.
Every file in this scope has a `SHA-256` hash stored in `frontend.lock.json`.

## ما الذي **لم** يُجمَّد؟ / What is NOT frozen?

- `backend/` — الباك‑إند يستمر بالعمل والتطوير الطبيعي.
- `selfhost/`, `docs/`, `release-evidence/` — تشغيل ووثائق.
- `package.json`, `package-lock.json` — لكن أي تعديل لا يمسّ الواجهة فعلياً.
- `.github/` — ملفات CI.

## كيف يُفرض التجميد؟ / How is the freeze enforced?

ثلاث طبقات حماية:

| Layer | File | When |
|---|---|---|
| **CI Guard** | `.github/workflows/frontend-freeze.yml` | كل PR وكل push على `main` |
| **CI Pipeline** | `.github/workflows/ci.yml` (خطوة `frontend:verify`) | في كل بناء عام |
| **Pre-commit Hook** | `.husky/pre-commit` | محلياً قبل أي commit |

أي تغيير (تعديل / إضافة / حذف) لملف داخل النطاق ⇒ **CI يفشل و الـ commit يُرفَض**.
Any change (modify / add / remove) to a file inside the scope causes the
verifier to exit non-zero and **CI fails / commit is rejected**.

## أوامر السكريبت / CLI

```bash
# تَحقُّق (هذا ما يستدعيه CI و pre-commit)
npm run frontend:verify

# عرض حالة مقروءة
npm run frontend:status

# (ممنوع بدون موافقة المالك) إعادة تجميد بعد تعديلات معتمدة
FRONTEND_UNFREEZE_TOKEN=I_HAVE_OWNER_APPROVAL npm run frontend:freeze
```

## فك التجميد / Unfreezing

الفك مرفوض افتراضياً. لإعادة الختم بعد تعديل **معتمد رسمياً من المالك**:

By default, unfreezing is refused. To re-seal after an **owner-approved**
change:

1. طبّق التعديلات.
2. شغّل:
   ```bash
   FRONTEND_UNFREEZE_TOKEN=I_HAVE_OWNER_APPROVAL \
     node scripts/freeze-frontend.mjs freeze
   ```
3. أضف `frontend.lock.json` المعدَّل في الـ commit نفسه.
4. اذكر سبب الفك في رسالة الـ commit (audit).

## مسار الـ Audit

كل لقطة تجميد تحمل:
- `frozenAt` — وقت الختم بالـ ISO-8601.
- `fileCount` — عدد الملفات المختومة.
- `hashes` — قاموس `{relativePath: sha256}` كامل.

أي اختلاف عن هذه اللقطة يُعرض في خرج `verify` بصيغة قابلة للقراءة.

## التَنبيه الأمني / Security Note

تذكَّر أن `FRONTEND_UNFREEZE_TOKEN` ليس آلية أمان قوية ضد المهاجم —
هو فقط حاجز ضد التعديل **العَرضي**. الحماية الحقيقية تأتي من:
1. Branch protection على `main` (يجب أن يمرّ workflow `frontend-freeze`).
2. Code-owner review على أي PR يلمس `frontend.lock.json`.

`FRONTEND_UNFREEZE_TOKEN` is a guardrail against accidental change, not
a security boundary. Real protection comes from branch protection rules
and code-owner review.
