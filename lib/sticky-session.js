var net = require('net'),
    cluster = require('cluster'),
    util = require('util');

function hash(ip, seed) {
  var hash = ip.reduce(function(r, num) {
    r += parseInt(num, 10);
    r %= 2147483648;
    r += (r << 10)
    r %= 2147483648;
    r ^= r >> 6;
    return r;
  }, seed);

  hash += hash << 3;
  hash %= 2147483648;
  hash ^= hash >> 11;
  hash += hash << 15;
  hash %= 2147483648;

  return hash >>> 0;
}

module.exports = function sticky(opts, callback) {
  var server;

  // Options are optional
  if ('function' === typeof opts) {
    callback = opts;
    opts = {};
  }

  // If `opts` is a number, normalize it
  if ('number' === typeof opts) {
    opts = {num: opts};
  }

  // A list of trusted addresses
  opts.trustedAddresses = opts.trustedAddresses || [];

  // `num` is optional
  if ('number' !== typeof opts.num) {
    opts.num = require('os').cpus().length;
  }

  // No workers
  if (0 === opts.num) {
    return typeof callback === 'function' ? callback() : callback;
  }

  // Master will spawn `num` workers
  if (cluster.isMaster) {
    var workers = [];
    for (var i = 0; i < opts.num; i++) {
      !function spawn(i) {
        workers[i] = cluster.fork();
        // Restart worker on exit
        workers[i].on('exit', function() {
          console.error('sticky-session: worker died');
          spawn(i);
        });
      }(i);
    }

    var seed = ~~(Math.random() * 1e9);
    server = net.createServer(function(c) {

      c.once('data', function(buffer) {

        var parser = require('http').parsers.alloc();
        parser.reinitialize('request');
        parser.onIncoming = function(req) {
          var address = c.remoteAddress || '';

          if (!!req.headers['x-forwarded-for']) {
            var proxies = req.headers['x-forwarded-for'].split(/\s*, */);
            var addresses = [address].concat(proxies);
            for (var i in addresses) {
              if (~opts.trustedAddresses.indexOf(addresses[i])) continue;
              address = addresses[i];
              break;
            }
          }

          // Get int31 hash of ip
          var worker,
              ipHash = hash((address).split(/\./g), seed);

          // Pass connection to worker
          worker = workers[ipHash % workers.length];

          // Pack the request with the message
          worker.send(['sticky-session:connection', buffer.toString('base64')], c);
        };
        parser.execute(buffer, 0, buffer.length);
        parser.finish();
      });
    });
  } else {
    server = typeof callback === 'function' ? callback() : callback;

    // Worker process
    process.on('message', function(msg, socket) {
      if (!util.isArray(msg)) return;
      if (!msg[0] || msg[0] !== 'sticky-session:connection') return;

      // Manually flush the request.
      socket.unshift(new Buffer(msg[1], 'base64'));
      socket.once('data', function(b) { socket.ondata(b, 0, b.length); });

      server.emit('connection', socket);
    });

    if (!server) throw new Error('Worker hasn\'t created server!');

    // Monkey patch server to do not bind to port
    var oldListen = server.listen;
    server.listen = function listen() {
      var lastArg = arguments[arguments.length - 1];

      if (typeof lastArg === 'function') lastArg();

      return oldListen.call(this, null);
    };
  }

  return server;
};
