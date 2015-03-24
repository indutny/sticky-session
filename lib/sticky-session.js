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
  *
  * Supports Node versions from 0.9.6 and up.
  */
function node96Republish(fd, data) {
  fd._handle.onread(new Buffer(data), 0, data.length);
}

/**
  * Access 'private' object _handle of file decriptor to republish the read
  * packet.
  *
  * Supports Node version from 0.12 and up.
  */
function node012Republish(fd, data) {
  fd._handle.onread(1, new Buffer(data));
}

/**
  * Hash balanced layer 3 connection listener.
  */
function layer3HashBalancedConnectionListener(c) {
  var self = this;

  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.remoteAddress || '').split(/\./g), self.seed);

  // Pass connection to worker
  worker = self.workers[ipHash % self.workers.length];
  worker.send('sticky-session:connection', c);
}

/**
  * Hash balanced layer 4 connection listener.
  *
  * The node is choosed randomly initial and gets hash balanced later in
  * patchConnection.
  */
function layer4HashBalancedConnectionListener(c) {
  var self = this;

  // Get int31 hash of ip
  var worker,
      random = crypto.randomBytes(4).readUInt32BE(0, true);

  // Pass connection to worker
  worker = self.workers[random % self.workers.length];
  worker.send('sticky-session:sync', c);
}

/**
  * Hash balance on the real ip and send data + file decriptor to final node.
  */
function patchConnection(c, fd, agent) {
  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.realIP || '').split(/\./g), agent.seed);

  // Pass connection to worker
  worker = agent.workers[ipHash % agent.workers.length];
  worker.send({ cmd: 'sticky-session:connection', data: c.data }, fd);
}

function sticky(options, callback) {
  var connectionListener,
      num = 0,
      agent = new StickyAgent(options, callback);

  if(cluster.isMaster) {
    return agent.setupMaster();
  } else {
    return agent.setupSlave();
  }
}

function StickyAgent(options, callback) {
  var version = process.version.substr(1);
  var index = version.indexOf('.');
  this.callback = callback;

  // `num` argument is optional
  if (typeof options === 'function') {
    this.callback = options;
    this.num = require('os').cpus().length;

    this.connectionListener = layer3HashBalancedConnectionListener;
  } else if (typeof options === 'number') {
    this.num = options;
    this.connectionListener = layer3HashBalancedConnectionListener;
  } else {
    if (typeof options.num === 'number') {
      this.num = options.num;
    } else {
      this.num = require('os').cpus().length;
    }

    /**
      * Set connectionListener to layer4HashBalancedConnectionListener
      * if proxy is set to true.
      */
    if (options.proxy) {
      this.connectionListener = layer4HashBalancedConnectionListener;
    } else {
      this.connectionListener = layer3HashBalancedConnectionListener;
    }

    /**
      * Changing the header if user specified something else than
      * 'x-forwarded-for'.
      */
    if (options.header) {
      this.header = options.header;
    }

    /**
      * Overwriting sync object to sync with users options.
      */
    if (options.sync) {
      this.sync = options.sync;
    }

    if (Number(version.substr(0, index)) >= 1 ||
        Number(version.substr(index + 1)) >= 12) {
      this.republishPacket = node012Republish;
    }
  }
}


StickyAgent.prototype.seed = 0;
StickyAgent.prototype.header = 'x-forwarded-for';
StickyAgent.prototype.republishPacket = node96Republish;
StickyAgent.prototype.sync = {
  isSynced: false,
  event: 'sticky-sessions:syn'
};

StickyAgent.prototype.setupMaster = function() {
  var self = this;

  // Master will spawn `num` workers
  self.workers = [];
  for (var i = 0; i < self.num; i++) {
    !function spawn(i) {
      self.workers[i] = cluster.fork();
      // Restart worker on exit
      self.workers[i].on('exit', function() {
      console.error('sticky-session: worker died');
      spawn(i);
    });

      self.workers[i].on('message', function(msg, c) {
        if (typeof msg === 'object')
        {
          if (msg.cmd === 'sticky-session:ack') {
            patchConnection(msg, c, self);
          }
        }
      });

    }(i);
  }

  self.seed = crypto.randomBytes(4).readUInt32BE(0, true) % 0x80000000;
  return net.createServer( function(c) { self.connectionListener(c); } );
};

StickyAgent.prototype.setupSlave = function() {
  var self = this;

  self.server = typeof self.callback === 'function' ? self.callback() : self.callback;

  process.on('message', function(msg, socket) { self.listener(msg, socket); });

  if (!self.server) {
    throw new Error('Worker hasn\'t created server!');
  }

  // Monkey patch server to do not bind to port
  var oldListen = self.server.listen;
  self.server.listen = function listen() {
    var lastArg = arguments[arguments.length - 1];

    if (typeof lastArg === 'function') {
      lastArg();
    }

    return oldListen.call(this, null);
  };

  return self.server;
};

/**
  * Worker process
  */
StickyAgent.prototype.listener = function(msg, socket) {
  var self = this;

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
      var searchPos = strData.indexOf(self.header);
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
      var sync = self.sync;

      /**
        * We register the event, to synchronize the data republishing
        * if the user wants for some reason manually call the sync.
        */
      if (sync.isSynced) {
        socket.once(sync.event, function() {
          self.republishPacket(socket, msg.data);
        });
      }

      self.server.emit('connection', socket);

      /**
        * We're going to push the packet back to the net controller,
        * to let this node complete the original request.
        */
      if (!sync.isSynced) {
        self.republishPacket(socket, msg.data);
      }
    }
  } else if (msg !== 'sticky-session:connection') {
    return;
  } else {
    self.server.emit('connection', socket);
  }
};