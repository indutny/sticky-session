# Sticky session

A simple performant way to use [socket.io](http://socket.io/) with a
[cluster](http://nodejs.org/docs/latest/api/cluster.html).

## Installation

```bash
npm install sticky-session
```

## Usage

```javascript
var sticky = require('sticky-sesion');

sticky(require('http').createServer(function(req, res) {
  res.end('worker: ' + process.env.NODE_WORKER_ID);
})).listen(3000, function() {
  console.log('server started on 3000 port');
});
```
Simple

```javascript
var sticky = require('sticky-sesion');

sticky(function() {
  // This code will be executed only in slave workers

  var http = require('http'),
      io = require('socket.io');

  var server = http.createServer(function(req, res) {
    // ....
  });
  io.listen(server);

  return server;
}).listen(3000, function() {
  console.log('server started on 3000 port');
});
```
Socket.io

## Reasoning

Socket.io is doing multiple requests to perform handshake and establish
connection with a client. With a `cluster` those requests may arrive to
different workers, which will break handshake protocol.

Sticky-sessions module is balancing requests using their IP address. Thus
client will always connect to same worker server, and socket.io will work as
expected, but on multiple processes!

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2012.

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
