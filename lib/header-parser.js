
var Code = {
    NewLine: "\n".charCodeAt(0),
    Colon: ":".charCodeAt(0),
    Space: " ".charCodeAt(0)
}

var forwardHeader = "x-forwarded-for";

function cmpBufferToString(buf, start, str) {
    var bufLen = buf.length, strLen = str.length;
    for (var k = 0; k < strLen; ++k) {
        var bufPos = start + k;
        if (bufPos >= bufLen) return false;
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
    var dLen = data.length;
    for (var k = start; k < dLen; ++k) {
        if (data[k] === code) return k;
    }
    return -1;
}

function findNotEq(code, data, start) {
    var dLen = data.length;
    for (var k = start; k < dLen; ++k) {
        if (data[k] !== code) return k;
    }
    return -1;
}

function findHeader(name, data, start) {
    var dLen = data.length;
    while (start >= 0 && start < dLen) {
        var headerStart = findEq(Code.NewLine, data, start) + 1;
        if (cmpBufferToString(data, headerStart, name)) {
            return headerStart + name.length + 1;
        } else {
            start = findEq(Code.NewLine, data, headerStart);
        }
    }
    return -1;
}

function parse(data) {
    var start = findEq(Code.NewLine, data, 0);
    var startHeader = findHeader(forwardHeader, data, start)
    if (startHeader === -1) return null;
    var endData = findEq(Code.NewLine, data, startHeader)
    return {start: startHeader, end: endData};
}

module.exports = parse;
