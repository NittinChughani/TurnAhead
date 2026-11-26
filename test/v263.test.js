import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('staff navigation exposes exactly one Public board link',()=>{
  const html=source('public/desk.html');
  assert.equal((html.match(/>Public board(?: ↗)?<\/a>/g)||[]).length,1);
  assert.equal((html.match(/id="public-board-link"/g)||[]).length,1);
  assert.doesNotMatch(html,/<a href="\.\/board\.html" class="nav-quiet">Public board<\/a>/);
  assert.match(source('public/desk.js'),/\$\('public-board-link'\)\.href=boardLink/);
});

test('feedback does not block the page while Firebase write is pending',()=>{
  const js=source('public/track.js');
  assert.match(js,/feedbackSending=true/);
  assert.match(js,/feedbackModal\.hidden=true;\s*feedbackProgress\.hidden=false;/);
  assert.match(js,/if\(feedbackSending\)return/);
  assert.match(js,/feedbackModal\.hidden=false;\s*\$\('feedback-state'\)\.textContent=/);
  assert.match(js,/finally\{\s*feedbackSending=false;/);
});

test('thank-you popup only appears after Firestore confirms submission',()=>{
  const js=source('public/track.js');
  const handler=js.slice(js.indexOf("\$('feedback-form').addEventListener('submit'"),js.indexOf('bindLanguage();'));
  const ack=handler.indexOf('await submitFeedback(');
  const success=handler.indexOf('showFeedbackSuccess();');
  const saved=handler.indexOf("persistent.setItem(feedbackSubmittedKey,'yes')");
  assert.ok(ack>=0&&success>ack&&saved>ack&&success>saved);
  assert.match(js,/feedbackSuccessTimer=setTimeout\(closeFeedbackSuccess,5000\)/);
  assert.match(js,/\$\('feedback-success-close'\)\.addEventListener\('click',closeFeedbackSuccess\)/);
});

test('static Firebase writer avoids deferred import on every feedback submission',()=>{
  const store=source('public/store.js');
  assert.match(store,/deleteField,setDoc,serverTimestamp/);
  const submit=store.slice(store.indexOf('export async function submitFeedback'),store.indexOf('export function observeFeedback'));
  assert.doesNotMatch(submit,/await import\(/);
  assert.match(submit,/await setDoc\(feedbackDoc\(/);
});

test('thank-you has accessible popup, motion and reduced-motion support',()=>{
  const html=source('public/track.html');
  const css=source('public/styles.css');
  assert.match(html,/id="feedback-progress"[^>]*role="status"/);
  assert.match(html,/id="feedback-success"[^>]*hidden/);
  assert.match(html,/class="v26-popup feedback-success-dialog" role="dialog" aria-modal="true"/);
  assert.match(html,/>Thank you for your response<\/h2>/);
  assert.match(html,/id="feedback-success-close"/);
  assert.match(css,/@keyframes feedbackSuccessBloom/);
  assert.match(css,/@keyframes feedbackSuccessDraw/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
