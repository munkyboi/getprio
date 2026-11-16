import React from 'react';
import { createRoot } from 'react-dom/client';
import { UniversalAuthPreparation } from '../src/pages/UniversalAuthPage';
const output = document.getElementById('result')!;
const root = createRoot(document.getElementById('root')!);
const delay = () => new Promise(resolve => setTimeout(resolve, 60));
let starts = 0; let verifies = 0;
const bad = { challengeId:'id', step:'email_otp' as const, deliveryTarget:'a***@test.invalid', expiresAt:'invalid' };
let valid = false; const adapter = { startCustomer: async () => { starts++; if (valid) await new Promise(resolve => setTimeout(resolve, 120)); return valid ? {...bad, expiresAt: new Date(Date.now() + 60000).toISOString()} : bad; }, resendCustomer: async () => bad, verifyCustomer: async () => { verifies++; throw new Error('uncertain'); } };
(async () => {
  root.render(<UniversalAuthPreparation adapter={adapter} onComplete={() => { throw new Error('unexpected completion'); }} />); await delay();
  const form = document.querySelector('form')!;
  for (const [key, value] of Object.entries({ name:'Test Person', username:'test_user', email:'test@example.invalid', password:'example-password' })) (form.elements.namedItem(key) as HTMLInputElement).value = value;
  form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); await delay();
  if (starts !== 1 || verifies !== 0 || !document.querySelector('[role=alert]') || document.querySelector('input')) throw new Error('invalid expiry or duplicate guard failed');
  root.unmount(); const second = createRoot(document.getElementById('root')!); valid = true; second.render(<UniversalAuthPreparation adapter={adapter} onComplete={() => { throw new Error('unexpected completion'); }} />); await delay(); const form2 = document.querySelector('form')!; for (const [key, value] of Object.entries({ name:'Test Person', username:'test_user', email:'test@example.invalid', password:'example-password' })) (form2.elements.namedItem(key) as HTMLInputElement).value = value; form2.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); form2.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); await new Promise(resolve => setTimeout(resolve, 180)); if (document.querySelector('[role=alert]') || !document.querySelector('input[autocomplete=one-time-code]')) throw new Error('duplicate submission interrupted successful challenge'); const code = document.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(code, '123456'); code.dispatchEvent(new Event('input', { bubbles:true })); await delay(); document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); await delay(); if (verifies !== 1 || !document.querySelector('[role=alert]') || document.querySelector('input')) throw new Error('uncertain verification did not clear code'); second.unmount(); output.textContent = 'PASS invalid expiry, single-flight, and sensitive fields removed after uncertainty';
})().catch(error => { output.textContent = `FAIL ${error.message}`; });
