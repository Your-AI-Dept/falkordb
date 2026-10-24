// Keeps the frontend's fixtures in the same language as the backend: canonical topics and real
// attendees/exhibitors from the shared dataset in ../data.
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {topics} from '../src/data/topics.js';
import {people,persona,viewer,boothInvitation} from '../src/data/pizza-expo.js';
import {freshExhibitorState} from '../src/exhibitor/data.js';

const root=new URL('../../data/',import.meta.url);
// The dataset lives at the repository root; skip when only frontend/ is mounted (e.g. the compose container).
const available=existsSync(new URL('pizza_expo_attendees_enriched.json',root));
const data=path=>JSON.parse(readFileSync(new URL(path,root)));
const attendees=available?new Map(data('pizza_expo_attendees_enriched.json').map(a=>[a.attendee_id,a.registration])):new Map();
const test=(name,fn)=>nodeTest(name,{skip:!available&&'data/ not available'},fn);

test('topics mirror data/program/topics.json exactly, in order',()=>{
  const canonical=data('program/topics.json');
  assert.deepEqual(topics.map(t=>({topic_id:t.id,name:t.name,description:t.description})),canonical);
  assert.deepEqual(topics.map(t=>t.idx),canonical.map((_,i)=>i));
});
test('every fixture person is a real attendee with matching name, company, title and business type',()=>{
  for(const person of people){
    const reg=attendees.get(person.id);
    assert.ok(reg,`${person.id} is not in the dataset`);
    assert.equal(person.name,`${reg.first_name} ${reg.last_name}`);
    assert.equal(person.company,reg.company);assert.equal(person.role,reg.job_title);assert.equal(person.businessType,reg.business_type);
    assert.equal(person.badge,person.id);
    assert.ok(person.topics.every(id=>topics.some(t=>t.id===id)),`${person.id} has a non-canonical topic`);
  }
  const me=attendees.get(viewer.id);
  assert.equal(viewer.name,`${me.first_name} ${me.last_name}`);assert.equal(viewer.company,me.company);assert.equal(viewer.role,me.job_title);
  assert.equal(new Set(Object.values(persona)).size,Object.keys(persona).length);
});
test('the demo exhibitor and booth are real: Mutti (EX-067) with its staff member',()=>{
  const exhibitor=data('program/exhibitors.json').find(e=>e.exhibitor_id==='EX-067');
  const state=freshExhibitorState();
  assert.equal(exhibitor.name,state.company);assert.equal(String(exhibitor.booth),state.booth);
  assert.ok(exhibitor.staff.includes(state.contact.id));
  assert.ok(exhibitor.topics.includes(state.topicId));
  assert.equal(boothInvitation.company,exhibitor.name);assert.equal(boothInvitation.location,'Booth '+exhibitor.booth);
});
