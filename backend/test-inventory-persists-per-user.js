const baseUrl = 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON from ${path}: ${text}`);
  }

  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    throw new Error(`${path} -> ${response.status}: ${message}`);
  }

  return data;
}

(async () => {
  const email = `inventory-${Date.now()}@example.com`;

  const register = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Inventory Tester',
      email,
      password: 'password123',
    }),
  });

  const token = register.token;
  const created = await request('/api/inventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Milk',
      quantity: 2,
      unit: 'l',
      expiryDate: '2026-10-15',
    }),
  });

  const inventory = await request('/api/inventory', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const containsMilk = items.some((item) => item.name === 'Milk');
  const onlyThisUser = items.length === 1 && items[0].name === 'Milk' && items[0].userId === register.user.id;

  if (!created.item || !containsMilk || !onlyThisUser) {
    console.error('Expected user inventory to contain only the created item for this user.');
    console.error(JSON.stringify({ created, items }, null, 2));
    process.exit(1);
  }

  console.log('PASS: inventory is scoped to the authenticated user.');
})().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
