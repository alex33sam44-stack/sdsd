# Smart App Install Prompt

The PWA install prompt is intentionally delayed until the user has already seen value.

## Trigger moments

- After the first successful route calculation in `/planner`.
- After the first route share action.

## Copy

After route calculation:

> ثبّت مواصلات عشان تعرف طريقك بضغطة واحدة كل يوم.

After route share:

> ثبّته وخلي مشاويرك محفوظة.

## Why

Showing install prompts on first page load hurts conversion. This implementation waits until the user has seen time, cost, transfers, and traffic, or has shared a route.

## Tracking events

- `app_install_prompt_shown`
- `app_install_prompt_clicked`
- `app_install_prompt_dismissed`
- `app_installed`

These appear in `growth_events` and can be analyzed beside `guest_route_created` and `guest_route_shared`.

## iOS

iOS does not expose the native `beforeinstallprompt` event. The prompt falls back to a short manual instruction: Share → Add to Home Screen.
