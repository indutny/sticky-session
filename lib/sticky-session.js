var net = require('net'),
    cluster = require('cluster'),
    http = require('http'),
    Random = require('random-js');

module.exports = sticky;

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

var internals = {
  workers: [],
  seed: 0,
  header: 'x-forwarded-for',
  version: {
    major: 0,
    sub: 1.0
  },
  republishPacket: node96Republish,
  sync: {
    isSynced: false,
    event: 'sticky-sessions:syn'
  },
  random: new Random(Random.engines.mt19937().autoSeed())

};

/**
  * Access 'private' object _handle of file decriptor to republish the read packet.
  */ 
function node96Republish( fd, data )
{
  fd._handle.onread( new Buffer( data ), 0, data.length );
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
  * The node is choosed randomly initial and gets hash balanced later in patchConnection.
  */
function layer4HashBalancedConnectionListener(c) {
  // Get int31 hash of ip
  var worker;

  // Pass connection to worker
  worker = internals.workers[ internals.random.integer( 0, internals.workers.length - 1 ) ];
  worker.send('sticky-session:sync', c);
}

/**
  * Hash balance on the real ip and send data + file decriptor to final node.
  */
function patchConnection( c, fd )
{
  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.realIP || '').split(/\./g), internals.seed);

  // Pass connection to worker
  worker = internals.workers[ipHash % internals.workers.length];
  worker.send( { cmd: 'sticky-session:connection', data: c.data }, fd );
}

function sticky(options, callback) {
  var server,
      connectionListener,
      num = 0;

  var version = process.version.substr(1);
  var index =version.indexOf('.');

  //Writing version to internals.version
  internals.version.sub = Number( version.substr( index + 1 ) );
  internals.version.major = Number( version.substr( 0, index ) );

  // `num` argument is optional
  if (typeof options === 'function') {
    callback = options;
    num = require('os').cpus().length;

    connectionListener = layer3HashBalancedConnectionListener;
  }
  else if ( typeof options === 'number' )
  {
    num = options;
    connectionListener = layer3HashBalancedConnectionListener;
  }
  else
  {
    if( typeof options.num === 'number' )
      num = options.num;
    else
      num = require('os').cpus().length;

    /**
      * Set connectionListener to layer4HashBalancedConnectionListener
      * if proxy is set to true.
      */
    if( options.proxy )
    {

      /**
        * Validating the version, as onread has changed multiple times.
        * https://github.com/joyent/node/blob/v0.11.4-release/lib/net.js#L487-L519
        */
      if( internals.version.major > 0 )
        throw new Error( 'sticky-sessions using layer4 is to old to be used with node major version ' + internals.version.major + ' please check for an udpate!' );
      else
      {
        if( internals.version.sub < 9.6 )
          throw new Error( 'sticky-sessions using layer4 does not support node version smaller than 0.9.6 please update node!' );
        else if( internals.version.sub < 11.4 )
          internals.republishPacket = node96Republish;
        else
          throw new Error( 'sticky-sessions using layer4 does not support currently node versions greater than 0.11.3, please check for an update!' );
      }

      connectionListener = layer4HashBalancedConnectionListener;
    }
    else
      connectionListener = layer3HashBalancedConnectionListener;

    /**
      * Changing the header if user specified something else than
      * 'x-forwarded-for'.
      */
    if( options.header )
      internals.header = options.header;

    /**
      * Overwriting sync object to sync with users options.
      */
    if( options.sync )
      internals.sync = options.sync;
  }


  // Master will spawn `num` workers
  if (cluster.isMaster) {
    internals.workers = [];
    for (var i = 0; i < num; i++) {
      !function spawn(i) {
        internals.workers[i] = cluster.fork();
        // Restart worker on exit
        internals.workers[i].on('exit', function() {
          console.error('sticky-session: worker died');
          spawn(i);
        });

        internals.workers[i].on( 'message', function( msg, c )
        {
          if( typeof msg === 'object' )
          {
            if( msg.cmd === 'sticky-session:ack' )
              patchConnection( msg, c );
          }
        } );

      }(i);
    }

    internals.yseed = internals.random.integer(0x0, 0x80000000);
    server = net.createServer(connectionListener);
  } else {
    server = typeof callback === 'function' ? callback() : callback;

    // Worker process
    process.on('message', function(msg, msgData) {

      /**
        * Worker received sync flagged request.
        */
      if ( msg === 'sticky-session:sync' )
      {

        /**
          * Reading data once from file descriptor and extract ip from the header.
          */
        msgData.once( 'data', function( data )
        {
          var strData = data.toString().toLowerCase();
          var searchPos = strData.indexOf( internals.header );
          var endPos = 0;

          /**
            * If the header was not found return, probably unwanted behavior.
            */
          if( searchPos === -1 )
            return;            

          searchPos = strData.indexOf( ':', searchPos ) + 1;

          strData = strData.substr( searchPos );

          endPos = strData.search( /\r\n|\r|\n/, searchPos );
          strData = strData.substr( 0, endPos ).trim().split( ':', 1 );
          strData = strData[ 0 ];

          //Send ackknownledge + data and real ip adress back to master
          process.send( { cmd: 'sticky-session:ack', realIP: strData, data: data }, msgData );

        } );  

      }
      /**
        * Message was an object and has to contain a cmd variable.
        */
      else if( typeof msg === 'object' )
      {
        /**
          * Master send us a finalized to us assigned file descriptor 
          * and the read data from the ip extraction.
          */ 
        if( msg.cmd === 'sticky-session:connection' )
        {
          var sync = internals.sync;

          /**
            * We register the event, to synchronize the data republishing
            * if the user wants for some reason manually call the sync.
            */
          if( sync.isSynced )
          {
            server.once( sync.event, function()
            {
              internals.republishPacket( msgData, msg.data );
            } );
          }

          server.emit('connection', msgData );

          /**
            * We're going to push the packet back to the net controller,
            * to let this node complete the original request.
            */
          if( !sync.isSynced)
            internals.republishPacket( msgData, msg.data );
        }
      }
      else if (msg !== 'sticky-session:connection') 
        return;
      else
        server.emit('connection', msgData);
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
