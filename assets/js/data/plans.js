// Subscription plans (illustrative pricing for the prototype, in MAD / month).
export const PLANS = [
  { id: 'starter', price: 299, maxUnits: 50 },
  { id: 'pro', price: 699, maxUnits: 200 },
  { id: 'business', price: 1490, maxUnits: null },
];

export const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[0];
