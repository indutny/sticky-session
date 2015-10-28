
var Code = {
    NewLine: "\n".charCodeAt(0),
    Colon: ":".charCodeAt(0),
    Space: " ".charCodeAt(0)
}

var forwardHeader = "x-forwarded-for";

function cmpBufferToString(buf, start, str) {
    for (var k = 0; k < str.length; ++k) {
        var bufPos = start + k;
        if (bufPos >= buf.length) return false;
        if (!eqcase(buf[bufPos], str.charCodeAt(k))) return false;
    }
    return true;
}

function eqcase(a, b) {
    return a === b ||
        (Math.abs(a - b) === 32 &&
         isLatinLetter(a) &&
         isLatinLetter(b))
}

function isLatinLetter(code) {
    return (code >= 97 && code <= 122) ||
        (code >= 65 && code <= 90);
}


function findEq(code, data, start) {
    for (var k = start; k < data.length; ++k) {
        if (data[k] === code) return k;
    }
    return -1;
}

function findNotEq(code, data, start) {
    for (var k = start; k < data.length; ++k) {
        if (data[k] !== code) return k;
    }
    return -1;
}



function findHeader(name, data, start) {
    while (start >= 0 && start < data.length) {
        var headerStart = findEq(Code.NewLine, data, start) + 1;
        if (cmpBufferToString(data, headerStart, name)) {
            return headerStart + name.length + 1;
        } else {
            start = findEq(Code.NewLine, data, headerStart);
        }
    }
    return -1;
}

function parse(data, fn) {
    var start = findEq(Code.NewLine, data, 0);
    var startHeader = findHeader(forwardHeader, data, start)
    if (startHeader === -1) return fn(null);
    var endData = findEq(Code.NewLine, data, startHeader)
    return fn(data, startHeader, endData);
}

module.exports = parse;

function noop(){}

if (process.env['TEST']) {
    var data = require('fs').readFileSync('header.txt');

    for (var k = 0; k < 1000000; ++k) parse(data, noop);
    console.time();
    for (var k = 0; k < 1000000; ++k) parse(data, noop);
    console.timeEnd();
    parse(data, function(data, start, end) {
        if (!data) return console.log("No header")
        console.log(data.slice(start, end).toString('utf8'))
    })
}