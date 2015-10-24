var util = require('util')
var net = require('net')

var Code = {
    Dot: '.'.charCodeAt(0),
    Zero: '0'.charCodeAt(0)
}

module.exports = Master;

util.inherits(Master, net.Server);
function Master(options) {
    if (!options || typeof options.activeWorkers != 'function') {
        throw new TypeError("Must provide activeWorkers option (returns a list of worker processes)")
    }
    net.Server.call(this, {
        pauseOnConnect: true
    }, this.balance)
    this.seed = (Math.random() * 0xffffffff) | 0
    this.workers = options.activeWorkers;
    this.retryDelay = options.retryDelay || 150
    this.maxRetries = options.maxRetries || 5
}

Master.prototype.hashString = hashString
function hashString(ipAddr) {
    var pos = 0, len = ipAddr.length, currentChar = 0, octet = 0
    var hash = this.seed
    do {
        if (pos === len || (currentChar = ipAddr.charCodeAt(pos)) === Code.Dot) {

            hash += octet
            hash %= 2147483648
            hash += (hash << 10)
            hash %= 2147483648
            hash ^= hash >> 6

            octet = 0
        }
        else {
            octet *= 10
            octet += (currentChar - Code.Zero)
        }
    } while (pos++ < len)

    hash += hash << 3
    hash %= 2147483648
    hash ^= hash >> 11
    hash += hash << 15
    hash %= 2147483648

    return hash >>> 0
}


Master.prototype.balance = function balance(socket, retry) {
  var workers = this.workers();
  var hash = this.hashString(socket.remoteAddress || '127.0.0.1');
  var responsibleWorker = workers[hash % workers.length];
  if (responsibleWorker == null) {
      var retryCount = (retry || 0) + 1
      if (retryCount < this.maxRetries) {
        setTimeout(this.balance.bind(this, socket, retryCount), this.retryDelay)
      } else {
        socket.end('HTTP/1.0 502 Bad Gateway\n\n');
      }
  } else {
    responsibleWorker.send('sticky:balance', socket);
  }
};
