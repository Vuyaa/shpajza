const inventory = [
  { id: 'item-1', name: 'Jaja', quantity: 6, unit: 'kom', expiryDate: '2026-10-20' },
  { id: 'item-2', name: 'Kruh', quantity: 1, unit: 'kom', expiryDate: '2026-10-15' },
  { id: 'item-3', name: 'Lubenica', quantity: 2, unit: 'kom', expiryDate: '2026-10-25' },
  { id: 'item-4', name: 'Mlječni sir', quantity: 200, unit: 'g', expiryDate: '2026-10-18' },
  { id: 'item-5', name: 'Rajčica', quantity: 4, unit: 'kom', expiryDate: '2026-10-19' },
  { id: 'item-6', name: 'Sol', quantity: 1, unit: 'kutija', expiryDate: null }
];

const recipes = [
  {
    id: 'recipe-1',
    name: 'Omlet',
    description: 'Brzi doručak od jaja i sira.',
    ingredients: [
      { name: 'Jaja', quantity: 2, unit: 'kom' },
      { name: 'Mlječni sir', quantity: 50, unit: 'g' },
      { name: 'Sol', quantity: 1, unit: 'prstohvat' }
    ]
  },
  {
    id: 'recipe-2',
    name: 'Salata od rajčice i lubenice',
    description: 'Svježa i jednostavna salata.',
    ingredients: [
      { name: 'Rajčica', quantity: 2, unit: 'kom' },
      { name: 'Lubenica', quantity: 1, unit: 'kom' },
      { name: 'Sol', quantity: 1, unit: 'prstohvat' }
    ]
  },
  {
    id: 'recipe-3',
    name: 'Sendvič',
    description: 'Klasičan sendvič sa sirom i kruhom.',
    ingredients: [
      { name: 'Kruh', quantity: 2, unit: 'kom' },
      { name: 'Mlječni sir', quantity: 80, unit: 'g' },
      { name: 'Rajčica', quantity: 1, unit: 'kom' }
    ]
  }
];

module.exports = { inventory, recipes };
