var sticky = require('../');

var assert = require('assert');
var http = require('http');

var PORT = 13845;

var server = http.createServer(function(req, res) {
  res.writeHead(200, {
    'X-Sticky': process.pid
  });
  res.end('hello world');
});

if (sticky.listen(server, PORT))
  return;

// Master
var waiting = 100;
for (var i = 0; i < waiting; i++) {
  http.request({
    method: 'GET',
    host: '127.0.0.1',
    port: PORT
  }, done).end();
}

function done(res) {
  assert(res.headers['x-sticky']);
  res.resume();
  if (--waiting === 0)
    process.exit(0);
}
