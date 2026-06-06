const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/users/merge',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', body.substring(0, 200)));
});
req.write(JSON.stringify({ keepUid: '123', deleteUid: '456' }));
req.end();
