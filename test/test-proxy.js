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

if (sticky.listen(server, PORT, { proxyHeader: 'x-forwarded-for', workers: 8 }))
  return;

// Master
var waiting = 100;
  batches = 2;

var returned = [];

for (var i = 0; i < waiting/batches; i++) {
  var request = http.request({
    method: 'GET',
    host: '127.0.0.1',
    headers:{
      'x-forwarded-for': '1.1.1.1'
    },
    port: PORT
  }, done);
  request.write('');
  request.end();
}

for (var i = 0; i < waiting/batches; i++) {
  var request = http.request({
    method: 'GET',
    host: '127.0.0.1',
    headers:{
      'x-forwarded-for': '255.255.255.255'
    },
    port: PORT
  }, done);
  request.write('');
  request.end();
}


function done(res) {
  assert(res.headers['x-sticky']);
  if(!inArray(returned, res.headers['x-sticky']))
    returned.push(res.headers['x-sticky']);
  res.resume();
  if (--waiting === 0){
    assert(returned.length === 2);
    process.exit(0);
  }
}

function inArray(arr, comparer) {
    for(var i=0; i < arr.length; i++) {
        if(arr[i] === comparer) return true;
    }
    return false;
};
