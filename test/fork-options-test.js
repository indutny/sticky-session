var sticky = require('../');

var assert = require('assert');
var cluster = require('cluster');
var http = require('http');

var PORT = 13845;

setTimeout(function(){
    console.error("Test time exceeded");
    process.exit(1);
}, 5000);

var server = http.createServer(function (req, res) {
    res.end('hello world');
});

if (sticky.listen(server, PORT, {workers: 1, env: {ohai: 23}})) {
    setTimeout(function () {
        process.send(process.env.ohai);
    }, 500);
} else {
// Master
    setTimeout(function () {
        cluster.workers[Object.keys(cluster.workers)[0]].on('message', function (msg) {
            assert.equal(msg, '23');
            process.exit(0);
        });
    }, 250);
}
