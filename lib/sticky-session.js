var net = require('net'),
    cluster = require('cluster');

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

module.exports = function sticky(num, callback) {
  var server;

  // `num` argument is optional
  if (typeof num !== 'number') {
    callback = num;
    num = require('os').cpus().length;
  }

  // Master will spawn `num` workers
  if (cluster.isMaster) {
    var workers = [];
    for (var i = 0; i < num; i++) {
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
      // Get int31 hash of ip
      var worker,
          ipHash = hash((c.remoteAddress || '').split(/\./g), seed);

      // Pass connection to worker
      worker = workers[ipHash % workers.length];
      worker.send('sticky-session:connection', c);
    });
  } else {
    server = typeof callback === 'function' ? callback() : callback;

    // Worker process
    process.on('message', function(msg, socket) {
      if (msg !== 'sticky-session:connection') return;

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
