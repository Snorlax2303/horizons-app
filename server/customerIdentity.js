export function classifyCustomerIdentity({ customerMatches = 0, customer = null, latestValidity = null, priorTrial = null, now = Date.now() }) {
  if (customerMatches > 1) return { identityState: 'ambiguous', trialEligible: false, customerExpired: false };
  if (customer) {
    const validityExpired = Boolean(latestValidity && new Date(latestValidity).getTime() <= now);
    const customerExpired = customer.status !== 'active' || customer.paid === false || validityExpired;
    return {
      identityState: customerExpired ? 'customer_expired' : 'customer_active',
      trialEligible: false,
      customerExpired,
    };
  }
  if (priorTrial) return { identityState: 'prior_trial', trialEligible: false, customerExpired: false };
  return { identityState: 'new_contact', trialEligible: true, customerExpired: false };
}
