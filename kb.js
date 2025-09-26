/**
 * Lightweight knowledge base for Gino's Pizza
 * Structured, filterable KB snippets
 */

const KB = {
  catering_prices: [
    { id: 'cat-10m-1t', label: '10 Medium (12") 1-Topping', price_from: 106 },
    { id: 'cat-10m-3t', label: '10 Medium (12") 3-Topping', price_from: 138 },
    { id: 'cat-10xl-1t', label: '10 X-Large (16") 1-Topping', price_from: 151 },
    { id: 'cat-10xl-3t', label: '10 X-Large (16") 3-Topping', price_from: 201 },
    { id: 'cat-10pr-1t', label: '10 Party Round (20") 1-Topping', price_from: 252 },
    { id: 'cat-10pr-3t', label: '10 Party Round (20") 3-Topping', price_from: 324 },
    { id: 'cat-10pt-1t', label: '10 Party Tray (21"x15") 1-Topping', price_from: 234 },
    { id: 'cat-10pt-3t', label: '10 Party Tray (21"x15") 3-Topping', price_from: 306 },
    { id: 'cat-10ps-1t', label: '10 Party Square (20"x20") 1-Topping', price_from: 297 },
    { id: 'cat-10ps-3t', label: '10 Party Square (20"x20") 3-Topping', price_from: 387 },
  ],
  
  dietary: {
    vegan_friendly: 'Items made with vegan ingredients; cross-contamination may occur.',
    vegetarian: 'Veg options like veggie pizzas, garlic bread, salads.',
    gluten_free: 'Cauliflower crust available (extra charge); cross-contamination possible.',
    customization: 'Flexible — create-your-own pizzas or adjust toppings.',
    reminder: 'Always advise guests to notify staff of any allergies or sensitivities.'
  },
  
  offers: [
    'Daily rotating specials (varies by store).',
    'Two-for-One pizza deals at select locations.',
    'eClub membership: exclusive deals, coupons, and birthday offers.'
  ],
  
  charity_policy: 'Thanks for reaching out about your event. We receive many requests and must say no in fairness, even if it\'s a great cause. We wish you success with your efforts.',
  
  hours: {
    sunday_thursday: '11:00 – 22:00',
    friday_saturday: '11:00 – 23:00',
    note: 'Exact hours may vary by store — confirm when caller provides city or postal code.'
  },
  
  pronunciations: {
    ginos: 'Jee-nohz',
    panzerotti: 'Pahn-zeh-ROH-tee',
    arrabbiata: 'Ah-rahb-byah-tah',
    mozzarella: 'Moht-sah-REL-lah'
  }
};

/**
 * Get knowledge base snippets by topic
 * @param {Object} params - Query parameters
 * @param {string} params.topic - Topic to fetch
 * @param {string[]} params.ids - Specific IDs to filter (for catering_prices)
 * @returns {*} KB data for the topic
 */
export function getKbSnippet({ topic, ids } = {}) {
  if (topic === 'catering_prices') {
    const rows = KB.catering_prices.filter(r => !ids || ids.includes(r.id));
    return rows.map(r => ({ id: r.id, label: r.label, price_from: r.price_from }));
  }
  if (topic === 'dietary') return KB.dietary;
  if (topic === 'offers') return KB.offers;
  if (topic === 'charity_policy') return KB.charity_policy;
  if (topic === 'hours') return KB.hours;
  if (topic === 'pronunciations') return KB.pronunciations;
  return null;
}

/**
 * Get all available topics
 * @returns {string[]} List of available topics
 */
export function getAvailableTopics() {
  return Object.keys(KB);
}
