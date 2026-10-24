// The event's 10 canonical topics, mirrored from data/program/topics.json (tests/dataset.test.js
// checks they stay identical). The backend, the graph view and this app all use these ids.
export const topics=Object.freeze([
  {id:'cheese-dairy',idx:0,name:'Cheese & Dairy',description:'Mozzarella, provolone, blends, melt and browning, cheese costs'},
  {id:'tomatoes-sauce',idx:1,name:'Tomatoes & Sauce',description:'Tomato products, crop outlook, signature sauces'},
  {id:'dough-flour',idx:2,name:'Dough & Flour',description:'Flour specs, fermentation, dough management'},
  {id:'meats-toppings',idx:3,name:'Meats & Toppings',description:'Pepperoni, sausage, produce and premium toppings'},
  {id:'spices-seasonings',idx:4,name:'Spices & Seasonings',description:'Herbs, hot honey, finishing sauces, crust seasoning'},
  {id:'ovens-equipment',idx:5,name:'Ovens & Equipment',description:'Deck, conveyor and wood-fired ovens, prep and refrigeration'},
  {id:'supply-chain-packaging',idx:6,name:'Supply Chain & Packaging',description:'Distributors, purchasing, boxes and sustainable packaging'},
  {id:'brick-and-mortar',idx:7,name:'Brick & Mortar Operations',description:'Labor, food cost, store design, opening new units'},
  {id:'chefs-culinary',idx:8,name:'Chefs & Culinary',description:'Pizzaiolos, menu development, competitions, technique'},
  {id:'tech-ordering-delivery',idx:9,name:'Tech, Ordering & Delivery',description:'POS, online ordering, delivery, loyalty and AI'},
]);
const byId=new Map(topics.map(topic=>[topic.id,topic]));
export const isTopic=id=>byId.has(id);
export const topicName=id=>byId.get(id)?.name||'';
/** The UI's {id,label} shape, with labels from the canonical names. */
export const topicOptions=topics.map(topic=>({id:topic.id,label:topic.name}));
