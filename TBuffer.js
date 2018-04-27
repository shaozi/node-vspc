const winston = require('winston')

class TBuffer {
  constructor(buf) {
    this.buffer = buf
    this.index = 0
  }

  setBuffer(buf) {
    this.buffer = buf
    this.index = 0
  }

  read(count) {
    count = count || 1
    var ret = []
    for (var i = 0; i < count; i++) {
      if (this.index == this.buffer.length) break
      ret.push(this.buffer.readUInt8(this.index))
      this.index++
    }
    if (count == 1) {
      return ret.length == 1 ?
        ret[0] : undefined
    }
    return ret
  }

  readUntil(n) {
    var ret = []
    for (var i = this.index; this.index < this.buffer.length; this.index++) {
      var val = this.buffer.readUInt8(this.index)
      if (val == n) {
        break
      }
      ret.push(val)
    }
    return ret
  }

  peek(count) {
    count = count || 1
    var ret = []
    var index = this.index
    for (var i = 0; i < count; i++) {
      if (index == this.buffer.length) break
      ret.push(this.buffer.readUInt8(index))
      index++
    }
    if (count == 1) {
      return ret.length == 1 ?
        ret[0] : undefined
    }
    return ret
  }

  print() {
    if (this.peek() == 255) { // IAC
      winston.debug(this.buffer)
    } else {
      winston.debug(this.buffer.toString('ascii'))
    }
  }
}

module.exports = TBuffer