import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {announcementChanges,activeAnnouncements} from '../public/v26-engine.js';
import {language,t} from '../public/locale.js';
const content=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('v2.6.1 detects successive doctor calls for the public display',()=>{
  const empty={id:'q',dayKey:'today',lanes:{d:{active:null}}};
  const first={...empty,lanes:{d:{active:{code:'GEN-001',counter:'Counter 2'}}}};
  const second={...empty,lanes:{d:{active:{code:'GEN-002',counter:'Counter 2'}}}};
  const s0=announcementChanges(new Map(),[empty],'today');
  assert.deepEqual(s0.calls,[]);
  const s1=announcementChanges(s0.current,[first],'today');
  assert.deepEqual(s1.calls,[{key:'q:d',code:'GEN-001',counter:'Counter 2'}]);
  assert.deepEqual(announcementChanges(s1.current,[first],'today').calls,[]);
  assert.deepEqual(announcementChanges(s1.current,[second],'today').calls.map(x=>x.code),['GEN-002']);
  assert.deepEqual(announcementChanges(s1.current,[empty],'today').calls,[]);
  assert.deepEqual(activeAnnouncements([{id:'q',dayKey:'old',lanes:first.lanes}],'today'),[]);
});
test('older public board active ticket shape is announced when it changes',()=>{
  const old={id:'legacy',active:{code:'OPD-009'}};
  const initial=announcementChanges(new Map(),[old]);
  assert.deepEqual(initial.calls,[{key:'legacy:legacy',code:'OPD-009',counter:'Reception'}]);
});
test('English-only UI has no language switches, Urdu strings or RTL flipping',()=>{
  assert.equal(language(),'en');
  assert.equal(t('voiceEnable'),'Enable announcements');
  for(const page of ['track','board','desk','admin']){
    assert.doesNotMatch(content(`public/${page}.html`),/data-lang-select|language-switch|اردو/);
  }
  assert.doesNotMatch(content('public/locale.js'),/document\.documentElement\.dir=lang===/);
  assert.doesNotMatch(content('public/locale.js'),/ur:\{/);
});
test('arrival CTA is right below the patient heading and feedback exists only as a modal',()=>{
  const html=content('public/track.html');
  const head=html.indexOf('class="track-head"');
  const arrival=html.indexOf('id="arrival-panel"');
  const loader=html.indexOf('id="track-loading"');
  const tickets=html.indexOf('id="track-content"');
  assert.ok(head>=0&&arrival>head&&loader>arrival&&tickets>loader);
  assert.match(html,/id="feedback-popup" class="v26-popup-wrap" hidden/);
  assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="feedback-title"/);
  assert.doesNotMatch(html,/id="feedback-panel"/);
  assert.match(content('public/track.js'),/turnahead-v26-feedback-seen/);
  assert.match(content('public/track.js'),/localStorage\.setItem\(feedbackSeenKey,'yes'\)/);
  assert.match(content('public/track.js'),/document\.visibilityState!=='visible'/);
});
test('public-board speech queues background calls and plays them on visibility restoration',()=>{
  const js=content('public/board.js');
  assert.match(js,/pendingCalls\.push/);
  assert.match(js,/document\.addEventListener\('visibilitychange'/);
  assert.match(js,/announcementChanges\(lastActive,queues,dayKey\(\)\)/);
  assert.match(js,/flushAnnouncements\(\)/);
  assert.doesNotMatch(js,/if\(!voiceEnabled\|\|!\('speechSynthesis' in window\)\|\|document\.hidden\)return/);
});
