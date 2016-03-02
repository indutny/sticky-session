'use strict';

var cluster = require('cluster');
var util = require('util');
var net = require('net');
var ip = require('ip');
var common = require('_http_common');
var parsers = common.parsers;
var HTTPParser = process.binding('http_parser').HTTPParser;


var debug = require('debug')('sticky:master');

function Master(options) {
  debug('master options=%j', options);

  var balanceFunc;
  if(options.proxyHeader)
    balanceFunc = this.balanceProxyAddress;
  else
    balanceFunc = this.balanceRemoteAddress;

  net.Server.call(this, {
    pauseOnConnect: true
  }, balanceFunc);

  this.options = options || {};
  this.seed = (Math.random() * 0xffffffff) | 0;
  this.workers = [];

  debug('master seed=%d', this.seed);

  for (var i = 0; i < options.workers; i++)
    this.spawnWorker();

  this.once('listening', function() {
    debug('master listening on %j', this.address());
  });
}
util.inherits(Master, net.Server);
module.exports = Master;

Master.prototype.hash = function hash(ip) {
  var hash = this.seed;
  for (var i = 0; i < ip.length; i++) {
    var num = ip[i];

    hash += num;
    hash %= 2147483648;
    hash += (hash << 10);
    hash %= 2147483648;
    hash ^= hash >> 6;
  }

  hash += hash << 3;
  hash %= 2147483648;
  hash ^= hash >> 11;
  hash += hash << 15;
  hash %= 2147483648;

  return hash >>> 0;
};

Master.prototype.spawnWorker = function spawnWorker() {
  var worker = cluster.fork();

  var self = this;
  worker.on('exit', function(code) {
    debug('worker=%d died with code=%d', worker.process.pid, code);
    self.respawn(worker);
  });

  debug('worker=%d spawn', worker.process.pid);
  this.workers.push(worker);
};

Master.prototype.respawn = function respawn(worker) {
  var index = this.workers.indexOf(worker);
  if (index !== -1)
    this.workers.splice(index, 1);
  this.spawnWorker();
};

Master.prototype.balanceRemoteAddress = function balance(socket) {
  var addr = ip.toBuffer(socket.remoteAddress || '127.0.0.1');
  var hash = this.hash(addr);

  debug('balacing connection %j', addr);
  this.workers[hash % this.workers.length].send(['sticky:balance'], socket);
};

Master.prototype.balanceProxyAddress = function balance(socket) {
  var self = this;
  debug('incoming proxy');
  socket.resume();
  socket.once('data', function (buffer) {
      var parser = parsers.alloc();
      parser.reinitialize(HTTPParser.REQUEST);
      parser.onIncoming = function (req) {

          //default to remoteAddress, but check for
          //existence of proxyHeader
          var address = socket.remoteAddress || '';

          if (self.options.proxyHeader && req.headers[self.options.proxyHeader]) {
              address = req.headers[self.options.proxyHeader];
          }
          debug('Proxy Address %j', address);
          var hash = self.hash(ip.toBuffer(address));

          // Pass connection to worker
          // Pack the request with the message
          self.workers[hash % self.workers.length].send(['sticky:balance', buffer.toString('base64')], socket);
      };
      parser.execute(buffer, 0, buffer.length);
      parser.finish();
  });
};
