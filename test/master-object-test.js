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

var serverInstance = sticky.listen(server, PORT, {returnInstance: true, workers: 1, env: {ohai: 23}});
if(serverInstance === false){
    process.exit(0);
}

server.once('listening', function() {
    assert.equal(serverInstance.address().port, PORT);
    process.exit(0);
});