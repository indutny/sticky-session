var sticky = require('../');

var assert = require('assert');
var cluster = require('cluster');
var http = require('http');

var PORT = 13845;

setTimeout(function(){
    console.error("Test time exceeded");
    process.exit(1);
}, 5000);
var completed = 0;
var runHost = function(host, expectation){

    var server = http.createServer(function (req, res) {
        res.end('hello world');
    });

    var serverInstance = sticky.listen(server, PORT, {returnInstance: true, host: host, workers: 1, env: {ohai: 23}});
    if(serverInstance === true){
        process.exit(0);
    }

    server.once('listening', function() {
        assert.equal(serverInstance.address().port, PORT);
        assert.equal(serverInstance.address().address, expectation);
        completed++;
        if(completed == 2){
            process.exit(0);
        }
    });
};
runHost(undefined, "::");
runHost("localhost", "127.0.0.1");
