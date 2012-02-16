var net = require('net'),
    cluster = require('cluster');

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
          hash = c.remoteAddress.split(/\./g).reduce(function(r, num) {
            r += num;
            r += (r << 10) & 2147483647;
            r ^= r >> 6;
            return r & 2147483647;
          }, seed);

      hash += hash << 3;
      hash ^= hash >> 11;
      hash += (hash << 15) & 2147483647;

      // Pause socket (so we won't loose any data)
      c.pause();

      // Pass connection to worker
      worker = workers[hash % workers.length];
      worker.send('sticky-session:connection', c._handle);

      // And detach socket from master process
      c._handle.close();
    });
  } else {
    server = typeof callback === 'function' ? callback() : callback;

    // Worker process
    process.on('message', function(msg, handle) {
      if (msg !== 'sticky-session:connection') return;
      var socket = new net.Socket({ handle: handle });

      // Socket is non-writable by default
      socket.readable = socket.writable = true;

      server.emit('connection', socket);

      // Unpause it
      socket.pause();
      socket.resume();
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
