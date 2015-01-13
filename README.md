# Sticky session

A simple performant way to use [socket.io](http://socket.io/) with a
[cluster](http://nodejs.org/docs/latest/api/cluster.html).

## Technical

Sticky Sessions are Hash Balanced by IP. Optionally layer4 header 
informations, for proxied connections, can be hashed.

### Prolog to Proxied connections

If you're using a proxy, like you do in many constellations, e.g. using a 
varnish as cache, using a *Cloudflare like* CDN or using DDoS Protections 
which are build on a so called *reverse proxy Server*.
There are many cases where you may not be able to avoid proxying the users 
requests,before they reach the node Application.

#### The Problem:

If we proxy any connection, the real IP will be lost. The original 
implementation of sticky-sessions worked only on layer 3 of the OSI Model. 
But the Information we need, is right now on layer 4.

**Note:** Only versions smaller than 0.11.14 and greater than 0.9.6 are 
supported.
The reason for this is that the behavior of onread in net.js has changed:
https://github.com/joyent/node/blob/v0.11.14-release/lib/net.js#L492-L514

Versions greater than 0.11.14 will be supported as soon as 0.11.x gets stable, 
as it may change until the stable release several times. 

## Installation

```bash
npm install sticky-session
```

## Configuration

You can optionally configure everything by the first parameter, by providing 
the following object:

```javascript
var options = {
    num: integer,
    proxy: boolean,
    header: string,
    sync: {
      isSyncable: boolean,
      event: string
    }
  };
```

### num

Specifies the **process count** and is omittable. If omitted the core count 
of the processor will be used instead.

### proxy

Specifies if the layer 4 patching should be used or not, 
**needed if behind a proxy**.

### header

Specifies the header containing the **real user IP** and is omittable. If 
omitted the header defaults to x-forwarded-for. Also the header is 
**case-insenstive**.

### sync

Object containing information to **manually call** the sync of the 
**initial packet** and is also omittable. If omitted the behavior defaults 
to not syncing.

#### isSyncable

Specifies if sync is used or not.

#### event

Specifies on which event sticky-sessions should **listen** if **isSyncable** 
is set to **true**.


**Note:** The options parameter is omittable if you do not need it or can be a 
number to specify the process count (old call behavior).

## Usage

### Without proxied connections

```javascript
var sticky = require('sticky-session');

sticky(require('http').createServer(function(req, res) {
  res.end('worker: ' + process.env.NODE_WORKER_ID);
})).listen(3000, function() {
  console.log('server started on 3000 port');
});
```
Simple

```javascript
var sticky = require('sticky-session');

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

### With proxied connections


```javascript
var sticky = require('sticky-session'),
    io;

var options = {
  proxy: true, //activate layer 4 patching
  header: 'x-forwarded-for', //provide here your header containing the users ip
  num: 2 //count of processes to create, defaults to maximum if omitted
}

sticky(options, function() {
  // This code will be executed only in slave workers

  var http = require('http');

  var server = http.createServer(function(req, res) {
    // ....
  });
  io = require('socket.io).listen(server);

  return server;
}).listen(3000, function() {
  console.log('server started on 3000 port');
});
```
Socket.io

```javascript
var sticky = require('sticky-session'),
    io;

var options = {
  proxy: true, //activate layer 4 patching
  header: 'x-forwarded-for', //provide here your header containing the users ip
  num: 2, //count of processes to create, defaults to maximum if omitted
  sync: {
    isSynced: true, //activate synchronization
    event: 'mySyncEventCall' //name of the event you're going to call
  }
}

var server = sticky(options, function() {
  // This code will be executed only in slave workers

  var http = require('http');

  var server = http.createServer(function(req, res) {
    // ....
  });
  io = require('socket.io).listen(server);

  return server;
}).listen(3000, function() {
  console.log('server started on 3000 port');
});

io.on('connection', function(socket) {
  // ... awesome stuff

  io.emit('mySyncEventCall');
});

```
Socket.io, synchronized


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
