# Exhibitor preview

One setup screen: company, booth number, one booth contact, capability, and focus. The activation is preset to Wednesday 1–2 PM. There are no editable team schedules or coverage confirmations.

The agenda shows one activation, its contact, relevant visitor needs, and scheduled/unavailable/check-in states. Guest details are visible without another click. Paul’s assigned 1–1:15 PM stop fits within that activation; his arrival or unavailability updates from the attendee demo in the same browser. There is no invitation or RSVP step. His private usefulness answer is never copied into the exhibitor guest DTO.

The guarded `rally.pizza-exhibitor.v2` storage key is retained for compatibility. Its payload is now version 3. Existing version 2 data migrates the first team member to the sole contact, preserving company, booth, capability, focus, and completion; old availability and coverage fields are dropped. New saves contain only the simplified state.

The default fixtures are Terra Rossa, booth 412, and Luca Rinaldi. The shared assignment is included only when the attendee has the booth on their schedule and the exhibitor company, booth, contact, and focus match. Before any attendee journey is saved, the standalone preview can show a scheduled Paul fixture. Unavailability and check-in changes refresh across tabs and on focus.

Everything remains a local prototype with fictional interactions. Nothing is sent externally. REST and the graph remain the separate teammate’s integration work. `npm test` checks migration, assignment eligibility, and signal separation; browser QA verifies the actual setup and agenda.
