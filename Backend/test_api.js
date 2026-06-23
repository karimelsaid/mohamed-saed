const http = require('http');
http.get('http://localhost:3000/api/merchant/public/list', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('API Response:', data));
});
