var IPHasher = require('../lib/ip-hash')
var parse = require('../lib/header-parser')

function testHasher() {
    var h = new IPHasher();
    var ip = '123.123.123.123';
    var ipBuf = Buffer(ip);
    console.log(h.hashString(ip), h.hashBytes(ipBuf, 0, ipBuf.length))

    console.time('str');
    for (var k = 0; k < 1000000; ++k) h.hashString(ip)
    console.timeEnd('str');
    console.time('byte')
    for (var k = 0; k < 1000000; ++k) h.hashBytes(ipBuf, 0, ipBuf.length)
    console.timeEnd('byte');
}

function noop(){}

function testHeader() {
    var data = require('fs').readFileSync('header.txt');

    for (var k = 0; k < 1000000; ++k) parse(data);
    console.time();
    for (var k = 0; k < 1000000; ++k) parse(data);
    console.timeEnd();
    var pos = parse(data);
    if (pos == null) {
        console.log("No header");
    }
    else {
        console.log(data.slice(pos.start+1, pos.end).toString('utf8'))
    }
}

testHasher()

testHeader();

