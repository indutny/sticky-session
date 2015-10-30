# sticky-listen

A simple performant way to use socket.io with [recluster][recluster], based on
Fedor's sticky-session

## Installation

```bash
npm install sticky-listen
```

## Usage

In your `cluster.js` that uses [recluster][recluster], use `sticky.createBalancer`
to create a sticky balancing server.

```js
var recluster = require('recluster'),
    path = require('path'),
    sticky = require('sticky-listen')

var cluster = recluster(path.join(__dirname, 'server.js'), {
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
  behindProxy: false,
  activeWorkers: cluster.activeWorkers,
  maxRetries: 5,
  retryDelay: 100
});

balancer.listen(8081, function() {
  console.log("Sticky balancer listening on port", 8081);
});

```

In your `server.js`, use `sticky.listen` instead of `server.listen` to start the server,
then use `process.send({cmd: 'ready'})` to indicate that the worker is ready.

```javascript
var sticky = require('sticky-listen');

var server = require('http').createServer(function(req, res) {
  res.end('worker: ' + process.env.NODE_WORKER_ID);
});

sticky.listen(server)

process.send({cmd: 'ready'})
```

## Acknowledgement

This module is based on Fedor Indutny's [sticky-session][sticky-session],
but it decouples the worker management logic, enabling you to use any cluster
library (such as recluster). The only requirement is that `createBalancer`
needs to be passed `activeWorkers`, a function that returns a hash containing

* a field `length`, the number of worker slots that serve requests
* for every key `0..length`, a field that contains a [worker object][api-cluster-worker]
  of a worker that is capable of receiving new connections. If a worker isn't
  ready at that slot, the field should be `null`

## API

### sticky.listen(server)

For use from the worker process

Listens for sticky connections from a worker server. The port doesn't need
to be specified.

### sticky.createBalancer(options)

For use from the master process

Creates a new master balancer server that balances between worker servers.

Returns a regular `net.Server`. Call server.listen(port) to start listening
for connections and balancing those connections across the cluster.

Sticky sessions are achieved based on the IP address of the client - requests
from the same IP are redirected to the same worker index.

The available options are

##### `activeWorkers`

A function that returns a hash of the worker slots. For recluster based
balancers that would be `cluster.activeWorkers`. The hash should contain:

* a field `length`, the number of worker slots that serve requests
* for every key `0..length`, a field that contains a [worker object][api-cluster-worker]
  of a worker that is capable of receiving new connections. If a worker isn't
  ready at that slot, the field should be `null`


##### `retryDelay`

If there are no worker available to serve the client, retry finding one after
`retryDelay` miliseconds.

##### `maxRetries`

The number of retries to attempt before giving up and sending a 502 Bad Gateway
error to the client.

##### `behindProxy`

If you use this option, sticky-listen will read the headers and look for
`x-forwarded-for` when reading the IP address of the client. This enables the
balancer to work well even behind proxies such as HAProxy or nginx.

## LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny and Gorgi Kosev, 2015

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[recluster]: https://github.com/doxout/recluster
[api-cluster-worker]: https://nodejs.org/api/cluster.html#cluster_class_worker
[sticky-session]: (https://github.com/indutny/sticky-session)