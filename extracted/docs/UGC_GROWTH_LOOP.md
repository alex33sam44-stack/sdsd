# UGC Growth Loop

The product now treats user-generated content as a viral loop, not just moderation input.

## Contribution types

- `report_traffic`: بلّغ عن زحمة
- `vote_route_correct`: صوّت هل الطريق صحيح؟
- `suggest_alternative`: اقترح بديل
- `ask_line_community`: اسأل أهل الخط
- `correct_fare`: صحّح سعر
- `add_stop`: أضف موقف
- `share_trip_story`: شارك تجربة مشوار

## User-facing loop

1. User sees a route or local area.
2. User contributes one small signal.
3. Product shows an immediate impact card:
   - "شكراً! ساعدت 23 شخص على نفس الطريق."
   - points earned
   - WhatsApp share CTA
4. The shared achievement brings more users from the same route/area.

## Tracking

The frontend emits:

- `ugc_contribution_created`
- `ugc_achievement_shared`

These events complement the growth dashboard and connect UGC to virality.

## Database

Migration adds:

- `ugc_contributions`
- `get_ugc_impact(area, route)`
- updated `growth_events` allowed event names

## Placement

UGC panel appears in:

- route results inside `/planner`
- local challenge pages `/areas/:slug`

This keeps the ask contextual: users contribute when the route or area is already relevant.
