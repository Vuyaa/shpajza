const baseUrl = 'http://localhost:4000';

async function run() {
  const registerPayload = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123'
  };

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });

  const registerText = await registerResponse.text();
  console.log('REGISTER_STATUS', registerResponse.status);
  console.log('REGISTER_BODY', registerText);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
    }),
  });

  const loginText = await loginResponse.text();
  console.log('LOGIN_STATUS', loginResponse.status);
  console.log('LOGIN_BODY', loginText);

  process.exit(registerResponse.status === 201 && loginResponse.status === 200 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
