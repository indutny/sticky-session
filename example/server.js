var http = require('http'),
    sticky = require('../');

sticky(http.createServer(function(req, res) {
  res.end('worker: ' + process.pid);
})).listen(3000, function() {
  console.log('server started on 3000 port');
});
