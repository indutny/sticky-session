var Master = require('./lib/master')

exports.createBalancer = createBalancer;

function createBalancer(options) {
    var master = new Master(options);
    return master;
}

exports.listen = listen;

function listen(server) {
    process.on('message', function(msg, socket, data) {
        if (msg === 'sticky:balance' && socket != null) {
            if (data != null) socket.push(data)
            server.emit('connection', socket);
        }
    });
    server.emit('listening')
    return true;
}