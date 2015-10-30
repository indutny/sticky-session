var Buffer = require('buffer').Buffer

var Code = {
    Dot: '.'.charCodeAt(0),
    Zero: '0'.charCodeAt(0)
}

function IPHasher() {
    this.seed = (Math.random() * 0xffffffff) | 0
}

IPHasher.prototype.hashString = hashString
IPHasher.prototype.hashBytes = hashBytes

function hashBytes(ipAddr, start, len) {
    var pos = start, currentChar = 0, octet = 0
    var hash = this.seed
    do {
        if (pos === len || (currentChar = ipAddr[pos]) === Code.Dot) {
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

module.exports = IPHasher;
