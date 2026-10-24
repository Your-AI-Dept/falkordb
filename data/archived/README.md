# Archived data

Kept for reference; **nothing in the repo reads these files**. The live dataset is the parent `data/` folder.

## `seed/`: seed files for the first design

Mock data files built for section 8.1 of the *first* design doc (speed dating with A/B sides, 120 attendees, hidden truth for the simulator). The design moved to 1,000 attendees, no sides and no hidden truth, so the backend seeds from the raw files instead. These were, built from the data above. IDs match the other files: an attendee's `id` is their `attendee_id`, a talk's `id` is its `session_id`, and a vendor's `id` is its `exhibitor_id`.

| File | Rows | Fields |
|---|---|---|
| `topics.json` | 10 | `idx` (0 to 9), `name`, `topic_id` |
| `talks.json` | 47 | `id`, `title`, `abstract`, `slot` (shared by talks starting at the same time), `room`, `start`, `end`, `topics` as `[{idx, w}]`, plus `type` and `speaker_ids` |
| `vendors.json` | 5 | `id`, `name`, `profile` (10 weights summing to 1), `budget`: Toast, Grande Cheese Company, Ardent Mills, The Middleby Corporation and Sysco |
| `attendees.json` | 120 | `id`, `name`, `side` (60 A, 60 B), `is_speaker` (18 speakers), `speaker_topics`, `resume_tags`, `signups` (talk ids), `truth` with `expertise`, `interest`, `talkativeness` and `modesty`, plus `company`, `title`, `business_type`, `city`, `state` and `country` |
| `linkedin.json` | 513 | `{a, b}` pairs, 5 to 10 per person, clustered by company, metro, line of business and main topic |
| `adhoc.json` | 86 | `{a, b}` pairs of people who met at the show, from booth scans and shared sessions |

How the hidden truth was made:
- **Expertise:** each person has 1 to 3 strong topics (0.65 to 0.95), taken from what they speak on, their exhibitor's topics and their job title. Every other topic is low (0.02 to 0.25).
- **Interest:** a Dirichlet draw weighted toward the topics they ticked at registration and their strong topics.
- **Resume tags:** expertise plus noise. They're weaker for people Bright Data found no LinkedIn profile for.

As the design doc says, `truth` belongs only in the simulator.
