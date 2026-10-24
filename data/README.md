# Pizza Expo 2027 attendees, enriched with Bright Data

1,000 Pizza Expo 2027 registrations, each enriched with what Bright Data's scrapers return: LinkedIn profile and company page, Crunchbase, Google Maps, a website scan, Instagram, X and GitHub. Everything is in Bright Data's own field names and shapes, ready to load into FalkorDB.

**The people are fake.** Every attendee, pizzeria and small business is invented. About 100 big real companies (Domino's, Toast, Sysco and others) keep their real names and carry real company data scraped live through Bright Data on October 24, 2026, with any real people's names removed. Emails, LinkedIn URLs and handles are made up and could match real ones by coincidence, so don't contact them.

## Files

| File | Use it for |
|---|---|
| `pizza_expo_attendees_enriched.json` | The graph source: one object per attendee, every Bright Data record nested in full |
| `pizza_expo_attendees_enriched.csv` | A flat 59-column view for a quick look |
| `pizza_expo_registrations.csv` | The original registration list, before enrichment |

## One attendee in the JSON

| Key | What's in it | Present for |
|---|---|---|
| `attendee_id`, `registration` | Registration form: name, email, company and title as typed, business type, ticket type, city | all 1,000 |
| `match` | `linkedin`: matched, matched_job_change, rejected, ambiguous or not_found; `google_maps`; `job_change` | all |
| `linkedin_profile` | Bright Data LinkedIn profile: `current_company` (name, company_id, title), `followers`, `about`, `posts`, `activity`, `people_also_viewed`, `bio_links` | 727 |
| `linkedin_company` | Bright Data LinkedIn company page: `id`, `name`, `industries`, `company_size`, `headquarters`, `website`, `followers`, `employees`, `similar` | 499 |
| `crunchbase` | Bright Data Crunchbase organization: `id`, `num_employees`, `funding_rounds`, `investors`, `industries`, `ipo_status` | 353 |
| `google_maps` | Bright Data Google Maps place: `place_id`, `rating`, `reviews_count`, `address`, `lat`, `lon`, `open_hours`, `top_reviews` | 412 |
| `website_scan` | `ordering_platforms`, `delivery_marketplaces`, `website_builder`, `loyalty_programs`, `social_handles` | 355 |
| `instagram`, `x`, `github` | Bright Data Instagram profile, X profile and GitHub repository records | 333, 106, 12 |

Missing sections are `null`. A missing section is part of the realism: many pizzeria owners aren't on LinkedIn, and since November 2025 LinkedIn hides job history, so `experience` and `education` are almost always null.

## A graph model that fits the data

**Nodes:**

| Node | Unique key | From |
|---|---|---|
| Attendee | `attendee_id` | `registration`; also index `linkedin_profile.url` |
| Company | `linkedin_company.id` | `linkedin_company`, `crunchbase`; for attendees without a company page, use the registered company name |
| Place | `google_maps.place_id` | `google_maps` |
| City | city, state, country | `registration` |
| Platform | name | `website_scan` lists (Toast, Slice, DoorDash, Wix and so on) |
| Investor | `crunchbase.investors[].investor.id` | `crunchbase.investors` |
| Account | URL | `instagram`, `x`, `github` |

**Relationships:**

| Relationship | From |
|---|---|
| `(Attendee)-[:WORKS_AT {title}]->(Company)` | `linkedin_profile.current_company` |
| `(Attendee)-[:PREVIOUSLY_AT]->(Company)` | the registered company, when `match.job_change` is true |
| `(Attendee)-[:BASED_IN]->(City)` | `registration` |
| `(Company)-[:OPERATES]->(Place)-[:IN]->(City)` | `google_maps` |
| `(Company)-[:USES {as: "ordering" or "delivery"}]->(Platform)` | `website_scan` |
| `(Company)-[:FUNDED_BY]->(Investor)` | `crunchbase.investors` |
| `(Company)-[:SIMILAR_TO]->(Company)` | `linkedin_company.similar[].Links` (3,216 links) |
| `(Attendee)-[:ALSO_VIEWED]->(Attendee)` | `linkedin_profile.people_also_viewed[].profile_link`, matched on profile URL (1,814 links between attendees) |
| `(Attendee)-[:HAS_ACCOUNT]->(Account)` | `instagram`, `x`, `github` |

**The demo query:** many platforms are also exhibitors at the show. Toast, Slice, Square, HungerRush, ChowNow, Owner.com, Clover, SpotOn, DoorDash, Uber and Grubhub all have attendees here. So a query can link an exhibitor's reps to the pizzerias that run a competitor's ordering platform, sorted by Google rating and review count: "which Slice shops should the Toast team meet?"

## Who's in it

400 independent pizzeria people, 100 from chain headquarters, 70 franchisees, 30 from multi-unit operators, 125 suppliers and manufacturers, 75 distributors, 120 from tech companies, and 80 in media, consulting and other roles. Most are from the US, with some from Canada, Mexico, Italy and elsewhere.
