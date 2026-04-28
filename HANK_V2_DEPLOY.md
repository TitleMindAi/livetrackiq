# Hank v2 Deploy Guide — 2026-04-24

All sprints from Hank's 2026-04-24 feedback are merged. Every change is behind a feature flag in `src/lib/constants.js → FEATURE_FLAGS`. Legacy code paths remain wired for fallback.

## 1) Run migrations (idempotent — `IF NOT EXISTS` / additive ALTERs)

```bash
cd livetrackiq
npx wrangler d1 execute livetrackiq-prod --remote --file=migrations/001_activity_events.sql
npx wrangler d1 execute livetrackiq-prod --remote --file=migrations/002_activity_conversion.sql
npx wrangler d1 execute livetrackiq-prod --remote --file=migrations/003_owner_role.sql
npx wrangler d1 execute livetrackiq-prod --remote --file=migrations/004_custom_goals.sql
npx wrangler d1 execute livetrackiq-prod --remote --file=migrations/005_lead_source.sql
```

Then mark Hank as the office owner so the Admin tab is hidden from everyone else:

```bash
npx wrangler d1 execute livetrackiq-prod --remote \
  --command "UPDATE users SET is_owner = 1 WHERE email = 'HANK_EMAIL_HERE';"
```

## 2) Build + deploy

```bash
npm run build
npx wrangler deploy
```

## 3) Feature flags (default ON; flip to false to roll back instantly)

| Flag | Default | Sprint | Effect when off |
|---|---|---|---|
| `ff_log_activities` | true | 1 | Falls back to legacy `QuoteLogger` |
| `ff_lead_sources` | true | 1 | Lead Source dropdown hidden on Intake/Activity |
| `ff_custom_date_range` | true | 1 | Custom From/To button hidden |
| `ff_quote_to_app` | true | 2 | Open Quotes panel + Submit App button hidden |
| `ff_all_trackables_board` | true | 3 | Scoreboard metric selector hidden (legacy submitted-apps view) |
| `ff_admin_lock` | true | 4 | Admin tab visible to admin/team_leader (legacy) |
| `ff_goals_expand` | true | 5 | Custom & Trackable Goals panel hidden |
| `ff_bonus_tab` | true | 6 | Bonus tab hidden |

## 4) New / changed files

```
livetrackiq/
├── migrations/
│   ├── 001_activity_events.sql       (Sprint 1 — new)
│   ├── 002_activity_conversion.sql   (Sprint 2 — new)
│   ├── 003_owner_role.sql            (Sprint 4 — new)
│   └── 004_custom_goals.sql          (Sprint 5 — new)
├── api/
│   ├── index.js                      (mounts /api/activities, /api/bonus)
│   ├── lib/validators.js             (logActivity, customGoal, submitFromActivity schemas)
│   └── routes/
│       ├── activities.js             (NEW: 8 trackables, open-quotes, submit-app)
│       ├── bonus.js                  (NEW: projection engine)
│       ├── goals.js                  (custom goal CRUD)
│       ├── dashboard.js              (custom range, trackable scoreboard)
│       └── auth.js                   (returns isOwner)
└── src/
    ├── App.jsx                       (Bonus nav, owner-gated Admin)
    ├── lib/
    │   ├── api.js                    (new endpoints)
    │   ├── bonus.js                  (NEW: placeholder schedule)
    │   └── constants.js              (FEATURE_FLAGS, ACTIVITY_TYPES, LEAD_SOURCES)
    ├── pages/
    │   ├── Dashboard.jsx             (custom range, scoreboard selector)
    │   ├── Goals.jsx                 (Add Goal, custom/trackable goals)
    │   ├── Admin.jsx                 (Deactivate fix, inactive toggle, email rename)
    │   ├── Intake.jsx                (Lead Source dropdown)
    │   └── Bonus.jsx                 (NEW: bonus tab)
    └── components/
        ├── ActivityLogger.jsx        (NEW: 8 trackables)
        └── OpenQuotes.jsx            (NEW: quote → submit app)
```

## 5) Outstanding asks for Hank

1. **Bonus PDF** — placeholder tier amounts in `src/lib/bonus.js`. Replace `BONUS_SCHEDULE` and `LINE_ITEM_BONUSES` with the real numbers when delivered.
2. **Premium-on-leaderboard rule** — Hank's email read inverted ("apps with premium do NOT show on leaderboard"). Current behavior: leaderboard reflects all submitted apps, which is the conventional read. Confirm and we'll flip if needed.
3. **Marketer Transfer** lead source — included in dropdown. Confirm exact definition.
4. **Lead Temperature "searchable"** — currently a dropdown on activities. If Hank meant a typeahead with custom values, we can extend `lead_temperature` to free text.

## 6) Smoke checks after deploy

- [ ] Login → see "Log Activities" instead of "Log Quotes"
- [ ] Log an Auto Quote → appears in Open Quotes
- [ ] Click Submit App → modal asks for 6-month premium → app appears on leaderboard
- [ ] Toggle scoreboard metric (Submitted Apps → Auto Quote) → leaderboard re-ranks
- [ ] Custom date range From/To filters work
- [ ] Admin tab hidden for non-owner accounts
- [ ] Deactivate button toggles user is_active without 400 error
- [ ] Goals tab → + Add Goal → "Investment Statements" with count/premium/closing
- [ ] Bonus tab loads, shows placeholder warning, what-if sliders update total

## 7) Rollback

Each migration has a documented rollback in its SQL header. To kill all new UI in one shot:

```js
// src/lib/constants.js
export const FEATURE_FLAGS = {
  ff_hank_v2: false,            // master kill switch (set false on all child flags)
  ff_log_activities: false,
  ff_lead_sources: false,
  ff_custom_date_range: false,
  ff_quote_to_app: false,
  ff_all_trackables_board: false,
  ff_admin_lock: false,
  ff_goals_expand: false,
  ff_bonus_tab: false,
};
```

Build + deploy → all v2 surfaces revert to legacy paths instantly.
