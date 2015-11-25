# Sticky session

A simple performant way to use [socket.io][0] with a [cluster][1].

## Installation

```bash
npm install sticky-session
```

## Usage

```javascript
var cluster = require('cluster'); // Only required if you want the worker id
var sticky = require('sticky-session');

var server = require('http').createServer(function(req, res) {
  res.end('worker: ' + cluster.worker.id);
});

if (!sticky.listen(server, 3000)) {
  // Master code
  server.once('listening', function() {
    console.log('server started on 3000 port');
  });
} else {
  // Worker code
}
```
Simple

## Reasoning

Socket.io is doing multiple requests to perform handshake and establish
connection with a client. With a `cluster` those requests may arrive to
different workers, which will break handshake protocol.

Sticky-sessions module is balancing requests using their IP address. Thus
client will always connect to same worker server, and socket.io will work as
expected, but on multiple processes!

#### Note about `node` version

`sticky-session` requires `node` to be at least `0.12.0` because it relies on
`net.createServer`'s [`pauseOnConnect` flag][2].

A deeper, step-by-step explanation on how this works can be found in
[`elad/node-cluster-socket.io`][3]

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2015.

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

[0]: http://socket.io/
[1]: http://nodejs.org/docs/latest/api/cluster.html
[2]: https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener
[3]: https://github.com/elad/node-cluster-socket.io
