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

function node96Republish( fd, data )
{
  fd._handle.onread( new Buffer( data ), 0, data.length );
}


function layer3HashBalancedConnectionListener(c) {
  // Get int31 hash of ip
  var worker,
      ipHash = hash((c.remoteAddress || '').split(/\./g), internals.seed);

  // Pass connection to worker
  worker = internals.workers[ipHash % internals.workers.length];
  worker.send('sticky-session:connection', c);
}

function layer4HashBalancedConnectionListener(c) {
  // Get int31 hash of ip
  var worker;

  // Pass connection to worker
  worker = internals.workers[ internals.random.integer( 0, internals.workers.length - 1 ) ];
  worker.send('sticky-session:sync', c);
}

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

    if( options.proxy )
    {
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

    if( options.header )
      internals.header = options.header;

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

    internals.yseed = ~~(Math.random() * 1e9);
    server = net.createServer(connectionListener);
  } else {
    server = typeof callback === 'function' ? callback() : callback;

    // Worker process
    process.on('message', function(msg, msgData) {
      if ( msg === 'sticky-session:sync' )
      {
        var strData,
            oData;

        msgData.once( 'data', function( data )
        {
          strData = data.toString().toLowerCase();
          var searchPos = strData.indexOf( internals.header );

          if( searchPos === -1 )
            return;            

          searchPos = strData.indexOf( ':', searchPos ) + 1;

          strData = strData.substr( searchPos );

          var endPos = strData.search( /\r\n|\r|\n/, searchPos );
          strData = strData.substr( 0, endPos ).trim().split( ':', 1 );
          strData = strData[ 0 ];

          oData = data;

          process.send( { cmd: 'sticky-session:ack', realIP: strData, data: data }, msgData );

        } );  

      }
      else if( typeof msg === 'object' )
      {
        if( msg.cmd === 'sticky-session:connection' )
        {
          var sync = internals.sync;

          if( sync.isSynced )
          {
            server.once( sync.event, function()
            {
              internals.republishPacket( msgData, msg.data );
            } );
          }

          server.emit('connection', msgData );

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
