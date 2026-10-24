fetch('http://localhost:4000/api/health')
  .then((response) => response.text())
  .then((text) => {
    console.log(text);
    return fetch('http://localhost:4000/api/recipes/match');
  })
  .then((response) => response.text())
  .then((text) => {
    console.log(text);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
