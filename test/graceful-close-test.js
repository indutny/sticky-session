var sticky = require('../');

var assert = require('assert');
var http = require('http');

var PORT = 13845;

var done = true;

var server = http.createServer(function(req, res) {
  done = false;
  server.close(function() {
    done = true;
  });

  res.writeHead(200, {
    'X-Sticky': process.pid
  });
  res.end('hello world');
});

if (sticky.listen(server, PORT, { workers: 1 })) {
  process.on('exit', function() {
    assert(done);
  });
  return;
}

// Master
var pid;

http.request({
  method: 'GET',
  path: '/close',
  agent: null,

  host: '127.0.0.1',
  port: PORT
}, function(res) {
  pid = res.headers['x-sticky'];

  res.resume();
  next();
}).end();

function next() {
  http.request({
    method: 'GET',
    agent: null,
    path: '/close',

    host: '127.0.0.1',
    port: PORT
  }, function(res) {
    assert.notEqual(pid, res.headers['x-sticky']);

    res.resume();

    setTimeout(function() {
      process.exit(0);
    });
  }).end();
}
