var sticky = require('../../')
var http = require('http')

var server = http.createServer(function(req, res) {
  res.writeHead(200, {
    'X-Sticky': process.pid
  });
  res.end('hello world');
});

sticky.listen(server)
process.send({cmd: 'ready'})
