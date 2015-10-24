var Master = require('./lib/master')

exports.createBalancer = createBalancer;

function createBalancer(options) {
    var master = new Master(options);
    return master;
}

exports.listen = listen;

function listen(server) {
    process.on('message', function(msg, socket) {
        if (msg === 'sticky:balance' && socket != null) {
            server.emit('connection', socket);
        }
    });
    server.emit('listening')
    return true;
}