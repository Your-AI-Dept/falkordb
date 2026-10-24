# Demo walkthrough

## The problem

A conference directory tells you who is present and how they describe themselves. It tells you much less about who can help with a specific problem right now. Attendees spend time on conversations that go nowhere; exhibitors pay for booth traffic without knowing whether it will produce a relevant conversation.

The demo asks whether the conversations already happening at the event can make the next connection more useful.

## Commercial use case

An organizer buys the event intelligence layer. Attendees get more relevant people and sessions; exhibitors get a better audience for a specific topic or booth activation. One concrete example: an equipment exhibitor has an oven specialist available for an hour. The app can invite attendees whose needs fit that expertise, then distinguish invitations, acceptances, visits, and useful conversations.

There is also a vendor-reach use case in the graph design: identify people with demonstrated topic knowledge and relevant connections. Topic expertise alone does not establish influence, buyer intent, or a willingness to promote a vendor. Keep those claims separate.

The commercial outcome to measure is qualified, useful conversations per activation. Pricing and willingness to pay remain hypotheses, not demo results.

## Three-minute walkthrough

### 0:00–0:25 — Set up the problem

“A badge tells us your company and title. It doesn't tell us whether you're the right person to help with a particular problem. And everyone at the event is learning useful things about one another that the event usually loses.”

Show one attendee's business context and a concrete event goal, such as solving an oven-capacity problem. Keep setup to a few taps. Imported company/profile context can reduce typing; it does not prove expertise or a relationship.

### 0:25–1:10 — Two people meet

Show the same completed meeting from each participant's perspective. Ask a topic-specific learning question: “On ovens and equipment, how did the learning go?” One person reports learning more; the other can report a different perspective. Save each answer in its own direction.

The next question comes from the backend's remaining uncertainty. It might ask about a different relevant topic or whether they could act together. Keep one question at a time in the same modal; all returned required questions must be answered. “It didn't come up” is a valid answer, not a positive or negative expertise signal.

The current local demo uses a generic usefulness question and branching fixtures. Replace its payload with the agreed topic-learning questions before claiming this segment demonstrates the actual graph model.

### 1:10–2:00 — Show learning across the event

Switch to the teammate's graph visualization. First show the directional evidence from that one meeting. Then simulate many conversations over the Pizza Expo dataset. Show a topic layer changing and, if implemented, convergence against the simulator's hidden truth.

“Now repeat that across the event. The graph combines many small, topic-specific observations. It can update which people appear knowledgeable without requiring everyone to write an essay after each conversation.”

Label simulated interactions and explain that much of the attendee data is synthetic. The dataset README distinguishes invented people from real company enrichment. Do not imply all attendees or relationships were scraped from a real conference.

### 2:00–2:35 — Answer a useful question

Return to Top people. Ask: “Who are the top three people for ovens and equipment?” Use the same query before and after the simulation. Show what changed and one defensible reason from the backend.

A person's name is the way to find them, not the proof. Their relevant expertise and evidence should carry the explanation. Do not use “you met Maya” as a claim of trusted access to somebody else.

The current fixture ordering is fixed. Only demonstrate ranking changes once the real API supplies them.

### 2:35–3:00 — Make the commercial payoff concrete

“An organizer can use this to place people in more useful conversations. An exhibitor can use it to bring the right audience to a specialist's booth session. We can then measure who accepted, who attended, and whether it was useful.”

If time allows, accept one booth invitation and show the agenda update. This is an optional commercial extension after the graph proof. End with the useful outcome, not an additional setup screen.

## Rehearsal cut line

One goal, one meeting, contrasting directional answers, one changing topic graph, one before/after ranking. Add the booth agenda only if that loop is already reliable. Rehearse using the exact API and dataset for the video. Reserve the final thirty minutes for recording and submission.
