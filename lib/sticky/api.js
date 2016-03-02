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
    options.workers = options.workers || os.cpus().length;

    var master = new Master(options);
    master.listen(port);
    master.once('listening', function() {
      server.emit('listening');
    });
    return false;
  }

  process.on('message', function(msg, socket) {
    if (!msg.length || msg[0] !== 'sticky:balance' || !socket)
      return;

    debug('incoming socket');

    // reappend the buffer
    if (msg[1]) {
      socket.unshift(new Buffer(msg[1], 'base64'));
    }

    server.emit('connection', socket);
  });

  return true;
}
exports.listen = listen;
