import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCustomerIdentity } from './customerIdentity.js';

test('allows a trial only for a phone without customer or completed trial', () => {
  assert.deepEqual(classifyCustomerIdentity({}), {
    identityState: 'new_contact', trialEligible: true, customerExpired: false,
  });
});

test('blocks a new trial for active and expired customers', () => {
  assert.equal(classifyCustomerIdentity({ customerMatches: 1, customer: { status: 'active', paid: true } }).identityState, 'customer_active');
  assert.equal(classifyCustomerIdentity({ customerMatches: 1, customer: { status: 'active', paid: false } }).identityState, 'customer_expired');
  assert.equal(classifyCustomerIdentity({ customerMatches: 1, customer: { status: 'inactive', paid: true } }).identityState, 'customer_expired');
  assert.equal(classifyCustomerIdentity({ customerMatches: 1, customer: { status: 'active', paid: true }, latestValidity: '2026-01-01T00:00:00Z', now: Date.parse('2026-08-13T00:00:00Z') }).identityState, 'customer_expired');
});

test('blocks repeated tests and ambiguous customer matches', () => {
  assert.equal(classifyCustomerIdentity({ priorTrial: { id: 'trial' } }).identityState, 'prior_trial');
  assert.equal(classifyCustomerIdentity({ customerMatches: 2 }).identityState, 'ambiguous');
});
