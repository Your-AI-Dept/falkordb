# Pizza Expo 2027 dataset

Raw data for the graph:
- **Attendees:** 1,000 registrations, each enriched with what Bright Data's scrapers return: LinkedIn profile and company page, Crunchbase, Google Maps, a website scan, Instagram, X and GitHub. The fields use Bright Data's own names and shapes.
- **The show program:** topics, exhibitors, sessions, session sign-ups and booth badge scans.

**The people are fake.** Every attendee, pizzeria and small business is invented. About 100 big real companies (Domino's, Toast, Sysco and others) keep their real names and carry real company data, scraped live through Bright Data on October 24, 2026, with any real people's names removed. Emails, LinkedIn URLs and handles are made up and could match real ones by coincidence, so don't contact them. The show program is invented too.

## Attendee files

| File | What it is |
|---|---|
| `pizza_expo_registrations.csv` | The registration export: name, email, company and title as typed, business type, badge type, topic interests, city, date |
| `pizza_expo_attendees_enriched.json` | One object per attendee, with the registration and every Bright Data record nested in full |
| `pizza_expo_attendees_enriched.csv` | The same, flattened to 60 columns |

### One attendee in the JSON

| Key | What's in it | Present for |
|---|---|---|
| `attendee_id`, `registration` | The registration row; `interests` holds the topics ticked on the form, separated by semicolons | all 1,000 |
| `match` | How each lookup went. `linkedin` is one of matched, matched_job_change, rejected, ambiguous or not_found; also `google_maps` and `job_change` | all |
| `linkedin_profile` | Bright Data LinkedIn profile: `url`, `current_company` (name, company_id, title), `followers`, `about`, `posts`, `activity`, `people_also_viewed`, `bio_links` | 727 |
| `linkedin_company` | Bright Data LinkedIn company page: `id`, `name`, `industries`, `company_size`, `headquarters`, `website`, `followers`, `employees`, `similar` | 499 |
| `crunchbase` | Bright Data Crunchbase organization: `id`, `num_employees`, `funding_rounds`, `investors`, `industries`, `ipo_status` | 353 |
| `google_maps` | Bright Data Google Maps place: `place_id`, `rating`, `reviews_count`, `address`, `lat`, `lon`, `open_hours`, `top_reviews` | 412 |
| `website_scan` | `ordering_platforms`, `delivery_marketplaces`, `website_builder`, `loyalty_programs`, `social_handles` | 355 |
| `instagram`, `x`, `github` | Bright Data Instagram profile, X profile and GitHub repository records | 333, 106, 12 |

A section is `null` when that source had nothing, which is realistic: many pizzeria owners aren't on LinkedIn, and since November 2025 LinkedIn hides job history, so `experience` and `education` are almost always null.

## Show program files (`program/`)

| File | Rows | Fields |
|---|---|---|
| `topics.json` | 10 | `topic_id`, `name`, `description` |
| `exhibitors.json` | 73 | `exhibitor_id`, `name`, `booth`, `booth_size`, `category`, `topics`, `description`, `website`, `linkedin_company_id`, `real_company`, `staff` (attendee_ids) |
| `sessions.json` | 47 | `session_id`, `title`, `type` (Keynote, Seminar, Panel or Demo), `topics`, `day`, `date`, `start`, `end`, `room`, `speakers` (attendee_id and role), `exhibitor_id` (demos only), `description` |
| `session_signups.csv` | 1,637 | `attendee_id`, `session_id`, `signed_up_at` |
| `booth_scans.csv` | 2,699 | `attendee_id`, `exhibitor_id`, `scanned_by` (the staffer's attendee_id), `scanned_at`, `lead_rating` (Hot, Warm or Cold), `notes` |

The 10 topics: Cheese & Dairy, Tomatoes & Sauce, Dough & Flour, Meats & Toppings, Spices & Seasonings, Ovens & Equipment, Supply Chain & Packaging, Brick & Mortar Operations, Chefs & Culinary, and Tech, Ordering & Delivery. The show runs March 23 to 25, 2027, and times are Las Vegas time.

## IDs shared across files

| ID | Where it appears |
|---|---|
| `attendee_id` (PE27-00001 to PE27-01000) | registrations, enriched attendees, `exhibitors.staff`, `sessions.speakers`, sign-ups, scans (`attendee_id` and `scanned_by`) |
| `topic_id` | `topics.json`, `exhibitors.topics`, `sessions.topics`. The registration `interests` use the topic names. |
| `exhibitor_id` | `exhibitors.json`, `sessions.exhibitor_id`, `booth_scans.csv` |
| `session_id` | `sessions.json`, `session_signups.csv` |
| `linkedin_company_id` | On exhibitors. Matches `linkedin_company.id` in the enriched attendees; null for a few small exhibitors without a page |
| LinkedIn profile URL | `linkedin_profile.url`, plus other attendees' `people_also_viewed[].profile_link` |

## Who's in it

400 independent pizzeria people, 100 from chain headquarters, 70 franchisees, 30 from multi-unit operators, 125 suppliers and manufacturers, 75 distributors, 120 from tech companies, and 80 in media, consulting and other roles. Their badges: 661 attendees, 240 exhibitor staff, 43 speakers, 39 press and 17 pizza competitors. Most are from the US, with some from Canada, Mexico, Italy and elsewhere.
