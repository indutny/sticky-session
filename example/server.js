var http = require('http'),
    sticky = require('../');

sticky(http.createServer(function(req, res) {
  res.end('worker: ' + process.env.NODE_WORKER_ID);
})).listen(3000, function() {
  console.log('server started on 3000 port');
});
