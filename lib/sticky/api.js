'use strict';

var cluster = require('cluster');
var os = require('os');
var debug = require('debug')('sticky:worker');

var sticky = require('../sticky-session');
var Master = sticky.Master;

function listen(server, port, options) {
  if (!options)
    options = {};

  if (cluster.isMaster) {
    var workerCount = options.workers || os.cpus().length;

    var master = new Master(workerCount);
    master.listen(port);
    master.once('listening', function() {
      server.emit('listening');
    });
    return false;
  }

  process.on('message', function(msg, socket) {
    if (msg !== 'sticky:balance' || !socket)
      return;

    debug('incoming socket');
    server.emit('connection', socket);
  });
  return true;
}
exports.listen = listen;
