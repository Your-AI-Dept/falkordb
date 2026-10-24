# Rally — practice and pitch runbook

## The pitch

**Rally gives every attendee a next stop worth going to, then uses feedback from those conversations to improve the event’s graph.**

An attendee arrives with a problem. The show assigns a person, time, and place. After they meet, each person answers a short survey. The graph keeps those perspectives separate and learns which people can help with which topics. The commercial extension is an assigned booth visit with the relevant person available to receive them.

The organizer is the proposed buyer. Attendees get less searching and more useful conversations. Exhibitors get scheduled conversations relevant to their products and expertise. A paid event pilot, with booth activations as an add-on, is the initial commercial hypothesis. Measure attended conversations rated useful; validate willingness to pay before claiming ROI.

## Three-minute stage script

Use one story throughout: **Paul runs three pizzerias and wants a reliable tomato supplier.** The names below are the frontend’s demo fixtures. If the integrated graph uses different people or topic IDs, substitute a verified pair everywhere before recording.

| Time | Show / click | Say |
| --- | --- | --- |
| 0:00–0:20 | Attendee setup, business context visible. | “At a trade show, an attendee is hoping to find the right person. An exhibitor is hoping that person walks past their booth. Both are spending time and money on chance.” |
| 0:20–0:40 | Continue → **Find better suppliers** → **Tomatoes & ingredients**. Use the prepared goal below. Click **Show my day**. | “Paul runs three pizzerias. He needs a reliable tomato supplier. Rally gives him a next stop: who to meet, where, and when. He doesn’t have to browse profiles or request meetings.” |
| 0:40–1:05 | **Meet Theo Marin**, Wednesday 12:15–12:30, table 4. **View stop → I’m here → Finish meetup**. Choose **Yes, useful → Tomato sourcing**. | “Paul meets Theo. The feedback is part of finishing the meetup. Paul found it useful and wants to keep working on tomato sourcing.” |
| 1:05–1:25 | **Back to my day → Theo’s survey** in the footer. Choose **Not really → A closer topic match**. | “Theo had a different experience. We keep both perspectives. A useful conversation for Paul doesn’t automatically mean it was useful for Theo. Their answers lead to different follow-up questions.” |
| 1:25–2:10 | Open the graph visualization. Show the two directed observations, then run the prepared batch of simulated encounters. Focus on one topic layer. | “This is where the graph matters. A profile gives us a starting point. Reports from conversations add evidence. Across many encounters, we can distinguish someone’s knowledge of a topic from how connected they are.” |
| 2:10–2:30 | Show **Top 3** for the same tomato/sourcing topic. Use verified graph-backed results for the payoff. Point to one changed position and its supporting evidence if available. | “Now ask a practical question: who should I talk to about tomato sourcing? The result should be supported by what the graph has learned about that topic.” |
| 2:30–2:50 | Return to Paul’s day. Open the scheduled **Booth 412** stop, click **I’m here**, then show the exhibitor agenda reflecting the check-in. | “The organizer can turn that relevance into a scheduled booth conversation. The exhibitor knows who is coming and why; the attendee knows where to go. We track whether the visit happened and whether it helped.” |
| 2:50–3:00 | Hold on the exhibitor agenda or the graph’s useful result. | “Rally turns the show into a day of relevant next stops. Every completed conversation gives the event more evidence for what should come next.” |

**Prepared event goal:** “Find a reliable tomato supplier for our three pizzerias.”

**Time cut:** If the graph segment runs long, omit the booth clicks and say the commercial payoff over the ranking screen. Keep the graph proof and the closing sentence.

## The graph handoff: choose the truthful version

**Once connected and verified:** “These two answers have now reached the graph. Watch this topic layer as we simulate the rest of the event.” Show the applied revision or another concrete confirmation before running the batch.

**While the frontend and graph are separate:** “You’ve seen the attendee experience. Now we’ll switch to our graph simulation to show how conversation evidence changes the model.” Clearly identify the simulated interactions. Do not imply the preceding clicks caused an update in the separate graph.

The local UI currently branches on usefulness responses. The teammate’s backend has topic-specific questions and a different survey shape; the adapter is not connected here. Only describe the displayed question as selected by the graph after that behavior is verified. If the integrated survey differs, rehearse its actual labels instead of following the fixture clicks above.

Local Top people ordering is fixed. If the graph-backed ranking is not connected to Rally, show the teammate’s real ranking in their visualization. Do not stage a before/after change using the local list. If the model itself is still simulated, describe it as simulation output, not measured improvement in real attendee outcomes.

## Rehearsal setup — before the timer starts

1. Use **http://127.0.0.1:5173/**. Port 3471 is the old prototype. Close distracting tabs before recording.
2. Keep three tabs ready: attendee, graph visualization, exhibitor. The footer provides Paul/Theo survey shortcuts. Do not put technical setup into the recorded demo.
3. In the rehearsal browser only, use **Start over** to clear prior answers. Fill or retain Paul’s business context: “We run three neighborhood pizzerias in San Francisco.” Leave the first setup screen ready. This resets that browser origin’s demo attendee state; do not reset a teammate’s live session.
4. Prepare the exhibitor view with **one contact, Luca Rinaldi; Terra Rossa; Booth 412; the preset 1:00 activation**. No team availability, coverage confirmation, guest picking, invitation request, or RSVP step.
5. The graph presenter prepares a known baseline, one relevant topic, and a reproducible simulation batch. Capture the baseline ranking. Confirm data provenance and whether the displayed people match the frontend pair. Imported company context and simulated people/interactions must remain distinguishable.
6. Configure `VITE_VISUALIZATION_URL` when the teammate supplies it and restart Vite. Until then, **Open visualization** is disabled: switch to the prepared graph tab manually. Rehearse this transition once.
7. Verify answers survive refresh, the graph receives the intended records if integrated, the simulation finishes, and the final ranking uses the expected topic and revision. Leave endpoints unchanged during this presentation pass.
8. Rehearse twice: first for correctness, second under three minutes. Reserve the final thirty minutes for recording, upload, and submission.

## Optional 45-second product proof, after the main pitch

Use this only for questions or a longer demo:

- Open the avatar: a profile summary appears; editing is an explicit action. The logo returns to that attendee’s home.
- Reopen a survey and use **Back / Next** to review answers. Change the first answer to show the new required follow-up. Finish it before moving on.
- Try **X** on unfinished feedback: the app explains that feedback is required and preserves saved answers.
- **Something else** opens a short written answer. **No more meetings like this** confirms the topic to pause for this event. Undo the pause from the profile. This is a scheduling preference, not a negative expertise rating.
- A chance meeting can be saved by scanning a QR badge. A scan records a chosen connection; it is not an endorsement or proof of topic knowledge.
- Complete the booth visit with **Finish visit**, then the inline usefulness answer. Keep check-in and usefulness distinct.

## What is demonstrable today

| Part | Verified frontend behavior | Presentation boundary |
| --- | --- | --- |
| Goal cards and assigned day | Working in local storage | Assignments are scripted, not graph-generated |
| Meetup and feedback | Arrival, finish, mandatory survey, two independent respondents, branching follow-ups, answer review/editing | Local branching; not yet live graph-selected questions |
| Alternative answers and preferences | Written answer; topic pause and profile undo | Local demo behavior pending backend mapping |
| Graph handoff | Modal link supports a configured URL | URL still needs to be supplied; manual tab switch works |
| Top X / topic | Topic/count controls, validated results, server order supported | Local rankings are fixed; live backend mapping remains separate work |
| Booth and exhibitor | Assigned visit, check-in reflected in booth agenda, inline visit feedback | Shared browser-local demo state, not cross-device synchronization |
| Enrichment, graph learning, simulation | Teammate-owned work | Verify the actual dataset, live behavior, and evidence before claiming them |

## Short answers for judges

**Why a graph?** “We need to represent different kinds of evidence: someone’s topic knowledge, their relationships, and each person’s experience of a meeting. Those are different signals. The graph lets us combine them without treating a connection as an endorsement.”

**Why would an organizer pay?** “Our commercial hypothesis is that an organizer can deliver more useful attended conversations and offer more relevant booth activations. We’d test that in a paid pilot, using attendance and feedback rather than raw match counts.”

**Why would attendees bother with feedback?** “They don’t have to search for their next meeting. The feedback is a short part of completing the one they just had, and they can steer future stops when the fit is wrong.”

**Does this already prove ROI or better rankings?** “No. The demo shows the workflow and the graph mechanism. A pilot needs to compare outcomes against profile-only matching and validate exhibitor willingness to pay.”

**What is the next integration step?** “Map the existing backend’s survey and ranking responses into the frontend adapter, connect the visualization, and run one complete round trip with the same people, topics, and applied graph revision.”
