var net = require('net'),
    cluster = require('cluster'),
    crypto = require('crypto');

module.exports = sticky;

function hash(ip, seed) {
  var hash = ip.reduce(function(r, num) {
    r += parseInt(num, 10);
    r %= 2147483648;
    r += (r << 10);
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


/**
  * Access 'private' object _handle of file decriptor to republish the read
  * packet.
  */ 
function node96Republish(fd, data) {
  fd._handle.onread(new Buffer(data), 0, data.length);
}


/**
  * Hash balanced layer 3 connection listener.
  */
function layer3HashBalancedConnectionListener(c) {
  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.remoteAddress || '').split(/\./g), internals.seed);

  // Pass connection to worker
  worker = internals.workers[ipHash % internals.workers.length];
  worker.send('sticky-session:connection', c);
}

/**
  * Hash balanced layer 4 connection listener.
  *
  * The node is choosed randomly initial and gets hash balanced later in 
  * patchConnection.
  */
function layer4HashBalancedConnectionListener(c) {
  // Get int31 hash of ip
  var worker,
      random = crypto.randomBytes(4).readUInt32BE(0, true);

  // Pass connection to worker
  worker = internals.workers[random % internals.workers.length];
  worker.send('sticky-session:sync', c);
}

/**
  * Hash balance on the real ip and send data + file decriptor to final node.
  */
function patchConnection(c, fd) {
  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.realIP || '').split(/\./g), internals.seed);

  // Pass connection to worker
  worker = internals.workers[ipHash % internals.workers.length];
  worker.send({ cmd: 'sticky-session:connection', data: c.data }, fd);
}

function sticky(options, callback) {

  var connectionListener,
      num = 0;

  // `num` argument is optional
  if (typeof options === 'function') {

    callback = options;
    num = require('os').cpus().length;

    connectionListener = layer3HashBalancedConnectionListener;
  } else if (typeof options === 'number') {

    num = options;
    connectionListener = layer3HashBalancedConnectionListener;
  } else {

    if (typeof options.num === 'number') {

      num = options.num;
    } else {

      num = require('os').cpus().length;
    }

    /**
      * Set connectionListener to layer4HashBalancedConnectionListener
      * if proxy is set to true.
      */
    if (options.proxy) {

      connectionListener = layer4HashBalancedConnectionListener;
    } else {

      connectionListener = layer3HashBalancedConnectionListener;
    }

    /**
      * Changing the header if user specified something else than
      * 'x-forwarded-for'.
      */
    if (options.header) {

      internals.header = options.header;
    }

    /**
      * Overwriting sync object to sync with users options.
      */
    if (options.sync) {

      internals.sync = options.sync;
    }
  }

  if(cluster.isMaster) {

    return internals.setupMaster(num, connectionListener);
  } else {

    return internals.setupSlave(callback);
  }
}

var internals = {

  workers: [],
  seed: 0,
  header: 'x-forwarded-for',
  republishPacket: node96Republish,
  sync: {
    isSynced: false,
    event: 'sticky-sessions:syn'
  },

  setupMaster: function(num, connectionListener) {

    // Master will spawn `num` workers
    internals.workers = [];
    for (var i = 0; i < num; i++) {
      !function spawn(i) {
        internals.workers[i] = cluster.fork();
        // Restart worker on exit
        internals.workers[i].on('exit', function() {
          console.error('sticky-session: worker died');
          spawn(i);
        });

        internals.workers[i].on('message', function(msg, c)
        {
          if (typeof msg === 'object')
          {
            if (msg.cmd === 'sticky-session:ack') {

              patchConnection(msg, c);
            }
          }
        });

      }(i);
    }

    internals.seed = crypto.randomBytes(4).readUInt32BE(0, true) % 0x80000000;
    return net.createServer(connectionListener);
  },

  setupSlave: function(callback) {

    internals.server = typeof callback === 'function' ? callback() : callback;

    process.on('message', internals.listener );

    if (!internals.server) {

      throw new Error('Worker hasn\'t created server!');
    }

    // Monkey patch server to do not bind to port
    var oldListen = internals.server.listen;
    internals.server.listen = function listen() {
      var lastArg = arguments[arguments.length - 1];

      if (typeof lastArg === 'function') {

        lastArg();
      }

      return oldListen.call(this, null);
    };

    return internals.server;
  },

  /**
    * Worker process
    */
  listener: function(msg, socket) {

    /**
      * Worker received sync flagged request.
      */
    if (msg === 'sticky-session:sync') {

      /**
        * Reading data once from file descriptor and extract ip from the
        * header.
        */
      socket.once('data', function(data) {

        var strData = data.toString().toLowerCase();
        var searchPos = strData.indexOf(internals.header);
        var endPos = 0;

        /**
          * If the header was not found return, probably unwanted behavior.
          */
        if (searchPos === -1) {

          return;            
        }

        searchPos = strData.indexOf(':', searchPos) + 1;

        strData = strData.substr(searchPos);

        endPos = strData.search(/\r\n|\r|\n/, searchPos);
        strData = strData.substr(0, endPos).trim();


        //Send ackknownledge + data and real ip adress back to master
        process.send(
          { cmd: 'sticky-session:ack', realIP: strData, data: data }, 
          socket
        );

      });  

    }
    /**
      * Message was an object and has to contain a cmd variable.
      */
    else if (typeof msg === 'object') {

      /**
        * Master send us a finalized to us assigned file descriptor 
        * and the read data from the ip extraction.
        */ 
      if (msg.cmd === 'sticky-session:connection') {

        var sync = internals.sync;

        /**
          * We register the event, to synchronize the data republishing
          * if the user wants for some reason manually call the sync.
          */
        if (sync.isSynced) {

          socket.once(sync.event, function() {

            internals.republishPacket(socket, msg.data);
          });
        }

        internals.server.emit('connection', socket);

        /**
          * We're going to push the packet back to the net controller,
          * to let this node complete the original request.
          */
        if (!sync.isSynced) {

          internals.republishPacket(socket, msg.data);
        }
      }
    } else if (msg !== 'sticky-session:connection') {

      return;
    } else {

      internals.server.emit('connection', socket);
    }
  }
};