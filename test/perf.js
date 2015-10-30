var recluster = require('recluster'),
    path = require('path'),
    sticky = require('../')

var cluster = recluster(path.join(__dirname, 'harness/server.js'), {
  readyWhen: 'ready'
});

cluster.run();

process.on('SIGUSR2', function() {
    console.log('Got SIGUSR2, reloading cluster...');
    cluster.reload();
});

console.log("spawned cluster, kill -s SIGUSR2", process.pid, "to reload");

// Added for the sticky listener:

var balancer = sticky.createBalancer({
  activeWorkers: cluster.activeWorkers,
  maxRetries: 5,
  retryDelay: 100
});

balancer.listen(8081, function() {
  console.log("Sticky balancer listening on port", 8081);
});
