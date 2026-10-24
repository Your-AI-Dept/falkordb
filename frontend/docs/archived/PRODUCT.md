# Rally: make the next connection count

Working name for the hackathon. Attendee-facing prototype; graph service developed separately.

## The idea in one paragraph

Rally is “Foursquare for events”: check in to the people you meet and the rooms you choose, then get a more useful suggestion for what to do next. Organic encounters create lightweight edges in an event graph. Short feedback after arranged meetings adds evidence about usefulness. The proposed graph uses those signals, attendee goals, availability, and group constraints to suggest meetings and evening rooms during a three-day conference. The hypothesis is that patterns of encounters can help reveal useful connections without recording what people discussed. That hypothesis still needs a real pilot.

The product promise: **Leave with people you are glad you met.**

## Value for attendees

Attendees invest attention, travel time, and often significant money. Their hardest networking problem is deciding which of hundreds of possible interactions is worth having, especially when they arrive alone.

- **A useful next step.** A short list of people, a reason for each suggestion, and a practical next action reduce the work of scanning a directory. “Priya is tackling a related product challenge” is more actionable than an unexplained match score.
- **A memory of the event.** Scanning after a conversation records who they met. The attendee can revisit those people and decide whom to follow up with. A scan is not a public endorsement or a purchase signal.
- **A lower-pressure introduction.** An arranged 15-minute meeting gives first-time attendees a time, place, and reason to talk. Requests require acceptance; sending one does not book the other person.
- **A smaller room where they can contribute.** Evening groups can combine relevant interests, complementary experience, and some unfamiliar people. An attendee can choose or decline a suggestion; room allocation must respect capacity and availability.
- **A conference that responds.** If a meeting was unhelpful, the next recommendation can change before the conference is over. Useful feedback should visibly affect the experience.
- **Control over commercial attention.** Exhibitor discovery is opt-in. A user can explore an exhibitor or accept a specific invitation without becoming a general-purpose lead.

Example: Alex arrives looking for collaborators, meets Maya at coffee, and scans her badge. A subsequent suggestion introduces Priya, who is working on a related product problem. Meetup feedback then helps choose between a builders' table and a room offering a different perspective.

Success evidence: the share of active attendees who report at least one useful new connection; recommendation acceptance and completed meetings; attendee-rated relevance; and planned follow-ups. Measure the response rate and include people with no connections rather than reporting only engaged users.

## Value for exhibitors

The exhibitor buys access to a relevant audience but has limited staff time. More badge scans do not necessarily mean more potential customers.

- **Relevant introductions.** Match stated attendee needs and opt-in preferences to an exhibitor's capabilities. Prioritize people who want the conversation, and explain the fit without exposing private meeting feedback.
- **Better use of booth staff.** Accepted meetings can be spread across available representatives and times. An unanswered invitation must not reserve time or count as a qualified meeting.
- **Small side events with a clear purpose.** A developer-tools exhibitor can host an API workshop for attendees interested in integration help. Room composition can include practitioners and complementary roles, not just a list of supposed buyers.
- **Better follow-up context.** With permission, retain the attendee's expressed interest and agreed next step, such as a trial, technical session, or demo. Do not invent context from a QR encounter.
- **An honest event funnel.** Track invitations → accepted meetings → completed meetings → attendee-confirmed usefulness → agreed next steps. Later CRM outcomes can extend that funnel to opportunities and revenue.
- **A stronger renewal case.** Exhibitors can compare useful conversations and follow-up actions across their event investment. The product should avoid calling scan volume “ROI.”

Example: Relay hosts an integration workshop. Jules invites attendees who explicitly want API help and have enabled relevant invitations. The exhibitor sees accepted invitations, attendance, and agreed follow-ups; it does not see an attendee's private relationship graph or meeting ratings.

Commercial hypothesis: organizers could sell hosted meeting programs, exhibitor team tools, and clearly labeled sponsored rooms. Paid placement should remain distinguishable from relevance-based suggestions, with relevance and attendee consent preserved.

## Value for organizers

Organizers need the event to produce value for two audiences: attendees who may return, and exhibitors or sponsors who may renew.

- **A chance to improve the event while it is running.** Aggregate signals can reveal attendees receiving no suggestions, unanswered requests, weak meeting relevance, or overfull rooms early enough to act.
- **Better room composition.** Move beyond a random shuffle or rigid job-title groups. Combine shared purpose, complementary roles, some unfamiliar connections, capacity, and attendee preferences. Offer a choice of suitable rooms instead of silently assigning people.
- **A more welcoming event.** Deliberately include newcomers and people with sparse graphs. A system that only amplifies highly connected participants could make the event worse for everyone else.
- **Less manual matchmaking.** Produce explainable candidate groups for a host to review rather than requiring staff to arrange every introduction from scratch.
- **Evidence of event value.** Report useful meetings, participant coverage, room attendance, and follow-up intent. Show denominators and feedback coverage. Network density alone cannot establish that people benefited.
- **A credible sponsor product.** Give exhibitors opt-in access to useful interactions and clear reporting, while protecting the attendee experience that makes the event valuable in the first place.

Example: On day two, an organizer sees that first-time founders have few accepted meetings. They create an additional small table, review suggested participants, and offer invitations. They can then check whether those participants attended and found the session useful.

Buyer hypothesis: the organizer is the primary customer; attendees receive access with registration; exhibitor features are an organizer add-on or a separate exhibitor package. Test this with prospective organizers rather than selecting a price during the hackathon.

## What the graph knows—and what it does not

| Signal | Reasonable interpretation | Not established |
| --- | --- | --- |
| One badge scan | Someone recorded an encounter | Mutual endorsement, meeting quality, buying intent |
| Accepted meeting request | Both parties agreed to meet | Attendance or usefulness |
| Completed arranged meeting + feedback | Reported relevance of this meeting | General quality or value of either person |
| Room reservation | Stated interest and a reserved place | Actual attendance |
| Stated exhibitor interest | Permission for the selected interaction | Permission to distribute contacts broadly |
| Public professional profile | Starting context, subject to correction | Private goals, needs, or current purchase intent |

Bright Data enrichment is optional future work, not required for the first demo. Use permitted public professional information, preserve source provenance, and let the attendee correct it. No scraping, participant imports, or external messaging are implemented here.

## Three-day journey

1. **Before / arrival:** confirm a minimal profile, select a goal and topic, set exhibitor visibility, receive initial suggestions.
2. **Day one:** meet organically, scan once, retain a connection, receive another suggested introduction.
3. **Arranged meetup:** meet for 15 minutes, answer a relevance question, then a short follow-up that depends on that answer.
4. **Evening:** explore a small room, understand its purpose and host, reserve a place or choose an alternative.
5. **Days two and three:** incorporate new signals, avoid repeated introductions, leave room for diverse connections, and surface people worth following up with.

The demo's day switch changes the scenario. It is not a time-travel simulation or evidence that the graph improved across three days.

## Hackathon scope and demo

Build the attendee loop first: Your day, Discover, Connections, Evening rooms, badge scan/manual entry, adaptive two-question meetup feedback, and room selection. Organizer and exhibitor dashboards are product directions, not part of this frontend release. Cross-conference identity is explicitly out of scope.

Two-minute demo:

1. Start on Day 1. Alex has two existing sample connections and an initial suggestion to meet Maya.
2. Choose **Scan a connection → Demo: meet Maya**. The encounter saves without a survey, the connection count becomes three, and Priya becomes the next suggestion.
3. Open **How did it go?** for the arranged meeting. Select **Yes, definitely → Get a fresh perspective**. Owen becomes the suggestion and the recommended room changes.
4. Explore the new room and save a place. The app records one reservation; switching rooms releases the previous selection.
5. Show Connections and Discover. Explain where a Node REST service will replace the fixture adapter.

All people, organizations, graph edges, capacities, and results in the current demo are sample data. Recommendations are deterministic rules, not an implemented learned graph. Requests and reservations remain in the browser. They do not send messages or notify anyone.

## Differentiation to test

Do not pitch “AI event matchmaking” as new. [Grip describes behavior-informed recommendations and meeting feedback](https://www.grip.events/products/event-matchmaking). [Brella describes meeting and booth analytics](https://www.brella.io/data-and-analytics). These vendor descriptions establish overlapping capabilities; they do not independently verify vendor performance claims.

The narrower hypothesis to test is whether low-friction real-world encounter capture plus adaptive small-room composition improves relevance within one event, with very little attendee input. Compare with an interest/profile-only baseline and a host-curated baseline. Keep an exploration allowance so sparse graphs and less popular participants still receive opportunities. Assess useful connections and attendee coverage alongside acceptance rates; collecting more scans alone is not a successful pilot.
