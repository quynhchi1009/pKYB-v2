---
target: Settings dropdown on the Monitoring overview
total_score: 22
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
target_identity: "file:/Users/quynhchilai/pKYB v2/src/components/SettingsPanel.tsx"
target_fingerprint: "sha256:46fc2951fbabfd33918d69470573390c9516081d6ee3f03c9aef040a37bf132d"
target_path: /Users/quynhchilai/pKYB v2/src/components/SettingsPanel.tsx
timestamp: 2026-10-19T08-13-55Z
slug: src-components-settingspanel-tsx
closed: true
---
Method: dual-agent (A: design review · B: detector + browser). Target: SettingsMenu (Settings dropdown on the Monitoring overview).

Score 22/36 (H9 n/a), Acceptable.
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No current state shown (customised? which severities alert?) |
| 2 | Match with real world | 3 | Plain descriptions; "Settings" is generic |
| 3 | User control & freedom | 2 | Focus drops to <body> after settings close |
| 4 | Consistency & standards | 2 | ~7 names for 2 areas; differs from system ⋯ menu |
| 5 | Error prevention | 3 | Team-wide scope not stated |
| 6 | Recognition over recall | 3 | Must remember what's currently set |
| 7 | Flexibility & efficiency | 1 | Extra click before a tabbed surface; arrows don't open it |
| 8 | Aesthetic & minimalist | 3 | Heavy for 2 items |
| 9 | Error recovery | n/a | No error states |
| 10 | Help & documentation | 3 | Descriptions act as inline help |

Design specificity: generic SaaS dropdown; tokens correct; says nothing about severity as the team's own risk model. Detector: CLI clean; browser flagged thin-border-wide-shadow on the menu (false positive per DESIGN.md pop spec); transition:width belongs to MonitorPanel.tsx:208.

Priority issues
1. [P1] Focus lost after choosing an item (body focus after settings close). Fix: SettingsHost records opener and restores focus. /impeccable harden
2. [P1] Menu off-screen at 375px / high zoom (right-0 anchor, opens at ~-132px). Fix: viewport-clamped positioning as ⋯ menu. /impeccable adapt
3. [P1] Focus indicator ~1.1:1 (focus-visible:outline-none, SettingsPanel.tsx:614; same in ui.tsx:345). Fix: inset 2px interactive-primary ring. /impeccable audit
4. [P2] Two doors into one room; names change on arrival (Severity settings / Severity mapping / Severity & notification settings / Settings / Alert settings). Fix: one name pair in SECTIONS; single button, or live state line per item. /impeccable clarify
5. [P2] Keyboard differs from ⋯ menu (no Home/End, End scrolls page; arrows don't open; no roving tabindex). Fix: shared Menu component. /impeccable harden

Personas: Alex (2 clicks, no shortcut, can't peek current mapping); Sam (focus loss, 1.1:1 focus, End scrolls, zoom clipping); portfolio analyst (no team-wide scope / last-changed at entry; severity–alert link hidden).

Minor: secondary trigger where ghost fits; shared sliders icon on trigger and Severity item; 280px/14px vs spec 200px/13px; not portalled.

Questions: single "Severity & alerts" button? entry beside the severity cards? show "customised · last changed · applies to all monitors" before editing?
