import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildNavigation} from '../scripts/build-navigation.mjs';
import {RoadGraph} from '../src/navigation.ts';
test('crossing source roads connect without fabricating long connector edges',()=>{
 const roads=[{points:[[-100,0],[100,0]],grade:'0'},{points:[[0,-100],[0,100]],grade:'0'}];
 const graph=new RoadGraph([],buildNavigation(roads));assert.ok(graph.route([-90,0],[0,90]).length>0);
 assert.ok(graph.nodes.some(p=>p[0]===0&&p[1]===0));
});
test('grade-separated crossings stay disconnected',()=>{
 const graph=new RoadGraph([],buildNavigation([{points:[[-100,0],[100,0]],grade:'0'},{points:[[0,-100],[0,100]],grade:'1'}]));
 assert.equal(graph.route([-90,0],[0,90]).length,0);
});
