const PAID_PLAN_PRICE_INVARIANTS = Object.freeze({
  economical: Object.freeze({ monthlyAmountCents: 49900, annualAmountCents: 498000 }),
  pro: Object.freeze({ monthlyAmountCents: 149900, annualAmountCents: 1499000 }),
  enterprise: Object.freeze({ monthlyAmountCents: 699900, annualAmountCents: 6999000 })
});

const PLAN_POLICY_FIXTURES = Object.freeze({
  free: Object.freeze({
    checkoutEnabled: false,
    features: Object.freeze({
      queue: true,
      branding: false,
      discovery: false,
      booking: false,
      campaigns: false
    }),
    allowances: Object.freeze({
      queueTickets: 500,
      queueEmailJourneys: 500,
      serviceBookings: 0
    })
  }),
  economical: Object.freeze({
    checkoutEnabled: true,
    features: Object.freeze({
      queue: true,
      branding: false,
      discovery: true,
      booking: true,
      campaigns: true
    }),
    allowances: Object.freeze({
      queueTickets: 1000,
      queueEmailJourneys: 1000,
      serviceBookings: 100
    })
  }),
  pro: Object.freeze({
    checkoutEnabled: true,
    features: Object.freeze({
      queue: true,
      branding: true,
      discovery: true,
      booking: true,
      campaigns: true
    }),
    allowances: Object.freeze({
      queueTickets: 5000,
      queueEmailJourneys: 5000,
      serviceBookings: 1000
    })
  }),
  enterprise: Object.freeze({
    checkoutEnabled: false,
    features: Object.freeze({
      queue: true,
      branding: true,
      discovery: true,
      booking: true,
      campaigns: true
    }),
    allowances: Object.freeze({
      queueTickets: 50000,
      queueEmailJourneys: 50000,
      serviceBookings: 10000
    })
  })
});

module.exports = {
  PAID_PLAN_PRICE_INVARIANTS,
  PLAN_POLICY_FIXTURES
};
