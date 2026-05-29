# Growth measurement

This release adds an internal growth measurement loop for the viral/referral system.

## Core events

| Event | Meaning |
| --- | --- |
| `invite_sent` | A user clicked a WhatsApp/referral invite CTA. |
| `invite_opened` | Someone opened a referral link with `?ref=`. |
| `signup_from_invite` | A new user signed up through a referral code. |
| `first_trip_created` | A referred user created their first trip. |
| `share_trip_created` | A live trip/share was sent through a share CTA. |
| `route_share_created` | A route result was shared. |
| `report_created` | A user reported congestion/breakdown/incident. |
| `question_answered` | A user answered another rider's question. |

## Dashboard

Open:

```txt
/growth
```

The dashboard shows:

- invite funnel
- K-factor
- viral cycle time
- invite → signup rate
- signup → first trip rate
- open → first trip rate

## Target

The product is truly viral when:

```txt
K-factor > 1
```

That means every user brings more than one new active user.
