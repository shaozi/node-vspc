// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


const logger = require('./logger')

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
    for (var i = this.index; i < this.buffer.length; i++) {
      var val = this.buffer.readUInt8(i)
      if (val == n) {
        break
      }
      ret.push(val)
    }
    this.index = i
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

  hasMoreData() {
    return (this.index < this.buffer.length)
  }

  print() {
    if (this.peek() == 255) { // IAC
      logger.debug(this.buffer)
    } else {
      logger.debug(this.buffer.toString('ascii'))
    }
  }
}

module.exports = TBuffer