# Viral launch priority polish

This pass tightens the viral launch surfaces around the seven highest-impact loops.

## 1. Route share page `/t/:token`

`/t/:token` is now treated as a public WhatsApp-first share page, not only a tracking utility.

It includes:

- no-login access
- strong public share hero
- route details
- live status / last update
- primary WhatsApp CTA: `ابعت الجروب يشوفوا الطريق`
- copy-ready Arabic share text
- dynamic OG preview support

## 2. Dynamic OG image per shared route

Backend OG previews now produce route-specific titles/descriptions for `/t/:token`:

- title: `أسرع طريق من X إلى Y`
- description: `التكلفة المتوقعة: N جنيه — الوقت: M دقيقة`
- image hero: `M دقيقة • N جنيه`

Caddy still serves server-side OG HTML to WhatsApp/Facebook/Twitter/Telegram bots while normal users receive the SPA.

## 3. Savings card as core feature

`/savings` is now linked from the passenger home page as a core loop:

- `وفرت كام هذا الأسبوع؟`
- money saved
- CO₂ saved
- people helped
- shareable story card

## 4. Public profile `/u/:username`

The profile route remains public and shareable with:

- badge
- people helped
- shared trips
- useful reports
- answered questions
- favorite area/line
- referral link

## 5. Area challenges `/areas/:slug`

Area pages remain local-first and include:

- weekly challenge
- most searched routes
- local reports
- top contributors
- community WhatsApp CTA
- local UGC and trust panels

## 6. Referral reward clarity

The invite page now has a clear goal:

> ادعُ 3 صحاب وافتح Badge مؤسس المنطقة

A new migration awards `area_founder` after three referrals and logs a notification.

## 7. Viral analytics funnel

The funnel now includes:

- `invite_sent`
- `invite_opened`
- `signup_from_invite`
- `first_trip_created`
- `share_trip_created`
- `route_share_created`
- `shared_route_opened`

This improves measurement from share creation to link open to signup and first trip.
