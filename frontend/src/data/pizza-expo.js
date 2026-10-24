// Demo fixtures built on real attendees from data/pizza_expo_attendees_enriched.json, so the offline
// demo, the live backend and the graph view show the same people (tests/dataset.test.js checks ids,
// names, companies and titles). The people are synthetic; see data/README.md.
//
// Old demo persona -> attendee (persona keys still work in demo links, e.g. ?participant=theo):
//   paul  -> PE27-00952 Drita Krasniqi, Co-Owner, Pizzeria Lupa (the signed-in demo attendee)
//   theo  -> PE27-00009 Sunil Desai, Restaurant Consultant, Crust Consulting Group
//   maya  -> PE27-00382 Simran Mehta, Chef & Owner, Stubborn Dough Co.
//   luca  -> PE27-00559 Bassam Khoury, Sales Specialist, Mutti (exhibitor EX-067, booth 1128)
//   elena -> PE27-00032 Francesca Napolitano, Owner, Barone Pizza Co.
//   samir -> PE27-00092 William Clark, Territory Mgr, Sysco Corporation
//   nia   -> PE27-00176 Steven Stewart, Owner/Operator, Uptown Wood Fired
export const persona=Object.freeze({paul:'PE27-00952',theo:'PE27-00009',maya:'PE27-00382',luca:'PE27-00559',elena:'PE27-00032',samir:'PE27-00092',nia:'PE27-00176'});
/** Demo links may use a persona key or an attendee id. */
export const resolvePersona=value=>persona[value]||value;
export const event = { id: 'pizza-expo', name: 'Pizza Expo', location: 'Las Vegas', venue: 'Las Vegas Convention Center', sourceUrl: 'https://www.pizzaexpo.com/show/about-pizza-expo/' };
export const goals = [
  { id: 'suppliers', icon: 'leaf', title: 'Find better suppliers', description: 'Ingredients, equipment & distribution' },
  { id: 'peers', icon: 'people', title: 'Trade ideas with peers', description: 'Learn from people who have been there' },
  { id: 'growth', icon: 'growth', title: 'Grow my business', description: 'Customers, partners & new possibilities' },
  { id: 'explore', icon: 'compass', title: 'See what’s new', description: 'Fresh ideas and unexpected connections' },
];
// `topics` are canonical topic ids (src/data/topics.js). The badge token is the attendee id, as in live check-ins.
export const people = [
  { id: persona.maya, name: 'Simran Mehta', role: 'Chef & Owner', company: 'Stubborn Dough Co.', businessType: 'Independent pizzeria (1-3 locations)', initials: 'SM', color: 'peach', category: 'Pizzeria owner', location: 'San Francisco, CA', bio: 'Runs Stubborn Dough Co., an independent pizzeria in San Francisco.', offering: 'Lessons from changing tomato and sauce suppliers', lookingFor: 'Other operators to trade practical ideas with', badge: persona.maya, topics: ['tomatoes-sauce', 'brick-and-mortar', 'tech-ordering-delivery'], slot: 'Wednesday · 2:00–2:15 PM', place: 'Coffee lounge' },
  { id: persona.luca, name: 'Bassam Khoury', role: 'Sales Specialist', company: 'Mutti', businessType: 'Manufacturer / supplier', initials: 'BK', color: 'sage', category: 'Tomato supplier', location: 'Chicago, IL', bio: 'Works with independent pizzerias on Mutti’s Italian tomato products.', offering: 'Italian tomato sourcing and sauce consistency', lookingFor: 'Pizzeria owners exploring a different tomato supplier', badge: persona.luca, topics: ['tomatoes-sauce', 'brick-and-mortar'], slot: 'Wednesday · 1:00–1:15 PM', place: 'Booth 1128' },
  { id: persona.elena, name: 'Francesca Napolitano', role: 'Owner', company: 'Barone Pizza Co.', businessType: 'Independent pizzeria (1-3 locations)', initials: 'FN', color: 'lavender', category: 'Dough specialist', location: 'San Francisco, CA', bio: 'Owns Barone Pizza Co. and works with long-fermented dough in a cool San Francisco kitchen.', offering: 'Cold fermentation and dough consistency', lookingFor: 'Bakers comparing fermentation approaches', badge: persona.elena, topics: ['dough-flour', 'tech-ordering-delivery'], slot: 'Wednesday · 2:30–2:45 PM', place: 'Coffee lounge' },
  { id: persona.samir, name: 'William Clark', role: 'Territory Mgr', company: 'Sysco Corporation', businessType: 'Distributor', initials: 'WC', color: 'sand', category: 'Food distributor', location: 'Oakland, CA', bio: 'Covers independent restaurants in the East Bay for Sysco.', offering: 'Regional distribution and ingredient logistics', lookingFor: 'Restaurant owners and producers building supply relationships', badge: persona.samir, topics: ['supply-chain-packaging'], slot: 'Wednesday · 3:00–3:15 PM', place: 'Coffee lounge' },
  { id: persona.nia, name: 'Steven Stewart', role: 'Owner/Operator', company: 'Uptown Wood Fired', businessType: 'Independent pizzeria (1-3 locations)', initials: 'SS', color: 'rose', category: 'Pizzeria operator', location: 'Los Angeles, CA', bio: 'Runs a wood-fired pizzeria in Los Angeles and is planning a second location.', offering: 'Choosing ovens and equipment for a second location', lookingFor: 'Owners navigating their next stage of growth', badge: persona.nia, topics: ['ovens-equipment', 'brick-and-mortar'], slot: 'Wednesday · 3:30–3:45 PM', place: 'Coffee lounge' },
  { id: persona.theo, name: 'Sunil Desai', role: 'Restaurant Consultant', company: 'Crust Consulting Group', businessType: 'Media / consulting / other', initials: 'SD', color: 'blue', category: 'Restaurant consultant', location: 'Los Angeles, CA', bio: 'Advises independent pizzerias on sourcing and kitchen operations.', offering: 'A practical second opinion on supplier decisions', lookingFor: 'Operators working through a sourcing challenge', badge: persona.theo, topics: ['supply-chain-packaging', 'meats-toppings', 'brick-and-mortar'], slot: 'Wednesday · 12:15–12:30 PM', place: 'Meeting table 4' },
];
/** The signed-in demo attendee's starting profile. */
export const viewer={id:persona.paul,name:'Drita Krasniqi',role:'Co-Owner',company:'Pizzeria Lupa',businessType:'pizzeria',context:'We run Pizzeria Lupa, an independent pizzeria in Oakland.'};
export const professionalEdges = [ { from: persona.maya, to: persona.luca, kind: 'professional', source: 'fixture' }, { from: persona.maya, to: persona.nia, kind: 'professional', source: 'fixture' } ];
export const boothInvitation = { id: 'mutti-tasting', personId: persona.luca, company: 'Mutti', title: 'A better tomato connection.', topic: 'Tomatoes & Sauce', topicId: 'tomatoes-sauce', time: 'Wednesday · 1:00–1:15 PM', location: 'Booth 1128', reason: 'You’re looking for tomato suppliers and chose to connect with Simran. Simran knows Bassam, who is available to discuss sourcing at the Mutti booth.', path: [{id:'you', name:'You'}, {id:persona.maya,name:'Simran'}, {id:persona.luca,name:'Bassam'}] };
