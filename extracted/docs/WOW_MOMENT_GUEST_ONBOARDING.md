# Wow moment within 30 seconds

The first-run flow should show value before asking for login.

## Flow

1. Open the app or a shared/marketing link.
2. Enter **from** and **to**.
3. See a route with estimated time, cost, transfers and traffic.
4. Share the route on WhatsApp.
5. Ask for signup only after value is shown, for saving trips, points, leaderboard and rewards.

## Implemented

- `/marketing` sends users to `/planner?from=...&to=...&src=marketing`.
- `/planner` now understands text `from` / `to` params and picks matching stations/stops once data is loaded.
- Route results show pre-login value: time, cost, transfers and traffic.
- WhatsApp route sharing remains available before login.
- A post-value signup prompt appears only after results are shown.
- Growth events added:
  - `guest_route_created`
  - `guest_route_shared`

## Why

Any login wall before the first useful route will reduce sharing and conversion. Signup should be framed as: save routes, join leaderboard, get badges, and help your area.
