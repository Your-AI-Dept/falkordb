# Rehearsal: from chance encounters to a relevant booth audience

Use port 5173 consistently. Keep attendee, graph visualization, and exhibitor views ready. This is a three-minute pitch with prepared screens; do not pretend the whole hour occurs in three minutes.

| Time | Show and do | Say |
| --- | --- | --- |
| 0:00–0:20 | Attendee profile and goal cards | “At a trade show, attendees hope to meet someone useful. Exhibitors hope the right person walks past. Both are relying on chance.” |
| 0:20–0:40 | Attendee home: four named matches, Wednesday 12–1 | “Rally gives you four people to meet in a dedicated hour. You know who, where, and when. No swiping or meeting requests.” |
| 0:40–1:05 | Open Sunil Desai (date 1), check in, finish, answer the survey: “Did you meet?”, true/false topic statements with “Didn’t come up”, then “Would you act on their recommendation?” and “Meet again?”. Show Sunil’s own survey separately (`?participant=theo`). | “Each person gives their own feedback. They may have learned different things from the same conversation. Follow-up questions can target what the graph still needs to learn.” |
| 1:05–1:30 | Prepared end-of-session state → Continue to graph; teammate's visualization | “We’re compressing the rest of the hour here. After the round, these observations feed the next computation.” Show actual simulation and applied updates only when wired; otherwise identify the handoff as a prototype. |
| 1:30–1:45 | Same-topic ranking before/after graph simulation | “Now we can ask who has evidence of expertise in pizza sauce, and who connects to relevant people.” Expertise and reach are separate signals. |
| 1:45–2:15 | Exhibitor view: profile → promotion | “I'm Bassam from Mutti, booth 1128. We're launching a pizza sauce. I want topic experts and micro-influencers for a private tasting, with 20% off a first order.” Continue from profile, choose Both, Find my audience. |
| 2:15–2:35 | Audience evidence → Invite people → preview → Send invitations | “The exhibitor gets a relevant audience and a concrete offer, rather than random foot traffic.” The current audience is labeled Sample graph. |
| 2:35–2:50 | View Simran's invitation → I'll be there; return to exhibitor response counts | “Simran accepts. The booth now knows who is coming.” Optional: check in, finish visit, required usefulness feedback. |
| 2:50–3:00 | Booth response view | “Organizers can sell exhibitors better access to relevant attendees, with invitations, acceptance, and actual visits they can measure.” Commercial hypothesis, not a measured revenue claim. |

## Preparation

- Start exhibitor from profile setup. If a campaign is already sent, New promotion starts another setup without deleting its history.
- Use all tabs on the same origin for shared local responses. `localhost` and `127.0.0.1` have separate storage.
- Keep the four matches fixed during the hour. Feedback affects future sessions; it does not shuffle the people already shown.
- All four stops must be finished or marked unavailable before the session handoff appears. Unavailability is not positive feedback or expertise evidence.
- Survey answers are respondent-specific. Back/Next allows review; X explains required completion. Other accepts text; No more meetings like this records a future preference.
- Check the visualization URL before recording. If missing, use the teammate's open visualization manually and name the handoff honestly.

## What is real in this frontend

Profile/setup, fixed lineup, required survey interaction, local persistence, explicit invitation preview, acceptance/decline, booth check-in, required visit feedback, and cross-tab response updates work locally. Survey and ranking adapters exist, but current backend payload mapping and graph recomputation are separate integration work. The exhibitor audience is seeded; sending invitations does not send email. No backend endpoints were changed for this demo revision.
