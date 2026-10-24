import { people, boothInvitation } from '../data/pizza-expo.js';
import { freshState as freshAttendeeState, invitationFor } from '../demo.js';

export const EXHIBITOR_STORAGE_KEY = 'rally.pizza-exhibitor.v2';
export const ATTENDEE_STORAGE_KEY = 'rally-pizza-attendee-v2';

export const capabilities = [
  { id: 'ingredients', title: 'Ingredients', description: 'Better pizza starts here.', icon: 'leaf', question: 'What do you know best?', focuses: [
    { id: 'tomatoes', label: 'Tomatoes & sauces', topic: 'Italian tomato sourcing', detail: 'Consistent flavor, reliable supply, and the right tomato for your pizza.', attendeeNeed: 'Finding a dependable tomato supplier', peerNeed: 'Comparing Italian tomato varieties' },
    { id: 'dough', label: 'Flour & dough', topic: 'Flour & fermentation', detail: 'Compare flour, proofing, and fermentation for a more consistent bake.', attendeeNeed: 'Improving cold-weather fermentation', peerNeed: 'Finding a flour that fits a longer proof' },
    { id: 'cheese', label: 'Cheese & toppings', topic: 'Cheese & toppings', detail: 'Explore cheese blends and toppings that work for your menu.', attendeeNeed: 'Balancing cheese quality and food cost', peerNeed: 'Testing a new mozzarella blend' },
  ] },
  { id: 'equipment', title: 'Equipment', description: 'Help kitchens work better.', icon: 'oven', question: 'Where is your expertise?', focuses: [
    { id: 'ovens', label: 'Pizza ovens', topic: 'Pizza oven selection', detail: 'Find the right balance of bake, capacity, and kitchen space.', attendeeNeed: 'Adding capacity in a small kitchen', peerNeed: 'Comparing deck and conveyor ovens' },
    { id: 'mixers', label: 'Mixers & prep', topic: 'Dough production & prep', detail: 'Talk through dough production and prep equipment with an expert.', attendeeNeed: 'Scaling dough production', peerNeed: 'Replacing an undersized mixer' },
    { id: 'cold-storage', label: 'Cold storage', topic: 'Cold storage', detail: 'Plan a reliable cold chain around your kitchen and daily prep.', attendeeNeed: 'Finding more space for cold fermentation', peerNeed: 'Planning storage for a second location' },
  ] },
  { id: 'operations', title: 'Restaurant operations', description: 'Run a smoother business.', icon: 'shop', question: 'What can you help with?', focuses: [
    { id: 'ordering', label: 'Ordering & delivery', topic: 'Ordering & delivery', detail: 'Explore a simpler path from online order to a happy customer.', attendeeNeed: 'Reducing third-party delivery dependence', peerNeed: 'Improving online ordering' },
    { id: 'staffing', label: 'Teams & staffing', topic: 'Staffing & retention', detail: 'Share practical approaches to scheduling, training, and retention.', attendeeNeed: 'Training a growing kitchen team', peerNeed: 'Making staff scheduling easier' },
    { id: 'margins', label: 'Costs & margins', topic: 'Menu costs & margins', detail: 'Connect menu choices, ingredient costs, and healthier margins.', attendeeNeed: 'Understanding margin by menu item', peerNeed: 'Managing fluctuating ingredient costs' },
  ] },
];

export const activation = Object.freeze({ id: 'pizza-expo-activation', day: 'Wednesday', label: '1:00–2:00 PM', hour: '1:00', end: '2:00 PM' });

export function freshExhibitorState() {
  const contact = people.find(person => person.id === 'luca');
  return { version: 3, complete: false, company: contact.company, booth: '412', capability: 'ingredients', focus: 'tomatoes', contact: { id: contact.id, name: contact.name } };
}

export function loadExhibitorState() {
  const fallback = freshExhibitorState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EXHIBITOR_STORAGE_KEY) || 'null');
    if (!parsed || ![2,3].includes(parsed.version) || typeof parsed.company !== 'string' || typeof parsed.booth !== 'string') return fallback;
    const capability = capabilities.find(item => item.id === parsed.capability);
    if (!capability?.focuses.some(item => item.id === parsed.focus)) return fallback;
    // Keep the first saved contact when migrating the earlier team setup.
    const contact = parsed.version === 2 ? parsed.team?.[0] : parsed.contact;
    if (!contact || typeof contact.id !== 'string' || typeof contact.name !== 'string' || !contact.name.trim()) return fallback;
    return { version: 3, complete: parsed.complete === true, company: parsed.company, booth: parsed.booth, capability: parsed.capability, focus: parsed.focus, contact: { id: contact.id, name: contact.name } };
  } catch { return fallback; }
}

function guest(personId, status, need) {
  const person = people.find(item => item.id === personId);
  return { id: person.id, name: person.name, company: person.company, initials: person.initials, color: person.color, status, need: need || person.lookingFor };
}

function attendeeGuest() {
  const fallback = freshAttendeeState();
  let attendee = fallback;
  let hasSavedAttendee = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(ATTENDEE_STORAGE_KEY) || 'null');
    if (saved?.version === 2 && saved.profile && typeof saved.profile.name === 'string' && typeof saved.profile.company === 'string' && Array.isArray(saved.encounters)) {
      attendee = saved;
      hasSavedAttendee = true;
    }
  } catch { /* Standalone sample when browser storage is unavailable. */ }
  // Once an attendee journey exists, use its actual invitation eligibility and response.
  // The standalone exhibitor preview retains a pending Paul fixture before that journey.
  if (hasSavedAttendee && !invitationFor(attendee)) return null;
  const profile = attendee.profile;
  const name = profile.name.trim() || fallback.profile.name;
  const company = profile.company.trim() || fallback.profile.company;
  const status = ['accepted', 'declined'].includes(attendee.boothInvitationStatus) ? attendee.boothInvitationStatus : 'pending';
  return { id: 'paul', name, company, initials: name.split(/\s+/).map(part => part[0]).slice(0, 2).join(''), status, need: typeof profile.intention === 'string' && profile.intention.trim() ? profile.intention.trim() : `Looking for dependable tomato supply for ${company}`, color: 'blue', checkedInAt: attendee.boothVisit?.invitationId === boothInvitation.id ? attendee.boothVisit.checkedInAt : null, invitationId: boothInvitation.id, appointment: boothInvitation.time };
}

function guestsForFocus(focusId, includeSharedInvitation) {
  if (focusId === 'tomatoes') return [guest('maya', 'accepted', 'Trade practical ideas on ingredient suppliers'), guest('samir', 'accepted'), includeSharedInvitation ? attendeeGuest() : null].filter(Boolean);
  if (focusId === 'dough') return [guest('elena', 'accepted')];
  if (focusId === 'cheese') return [guest('maya', 'accepted', 'Trade practical ideas on ingredient suppliers'), guest('theo', 'pending')];
  if (['ovens', 'mixers', 'cold-storage'].includes(focusId)) return [guest('nia', 'accepted', 'Compare equipment choices while growing a pizzeria')];
  if (focusId === 'staffing') return [guest('maya', 'accepted', 'Compare ideas for keeping a great pizzeria team')];
  if (focusId === 'margins') return [guest('maya', 'accepted', 'Compare practical approaches to pizzeria margins')];
  return [];
}

export function makeBoothPlan(state) {
  const capability = capabilities.find(item => item.id === state.capability) || capabilities[0];
  const focus = capability.focuses.find(item => item.id === state.focus) || capability.focuses[0];
  const sharedInvitationFits = state.contact.id === boothInvitation.personId && state.company.trim() === boothInvitation.company && `Booth ${state.booth.trim()}` === boothInvitation.location;
  return [{ id: activation.id, contact: state.contact, window: activation, title: focus.topic, guests: guestsForFocus(focus.id, sharedInvitationFits) }];
}
