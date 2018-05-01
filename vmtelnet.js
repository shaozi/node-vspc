// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const assert = require('assert')
const winston = require('winston')
const TBuffer = require('./TBuffer')
const TELNET = require('./telnet_const')

function sendTelnetCommand(socket, action, cmd) {
  if (typeof(cmd) != 'undefined') {
    socket.write(Buffer.from([TELNET.IAC, action, cmd]))
  } else {
    socket.write(Buffer.from([TELNET.IAC, action]))
  }
}

function sendVMWareOption(socket, options) {
  socket.write(Buffer.from([TELNET.IAC, TELNET.SB, TELNET.VMWARE_TELNET_EXT].concat(
    options, TELNET.IAC, TELNET.SE
  )))
}

function processVMWareSubOption(socket, tBuffer, supportedCommands) {
  assert(tBuffer instanceof TBuffer)
  winston.debug('process vmware sub negotiation')
  var option = tBuffer.read()
  var valArray = tBuffer.readUntil(TELNET.IAC)
  switch (option) {
    case TELNET.VM_NAME:
      var recvVmName = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, '')
      socket.emit('vm name', recvVmName)
      winston.info(`VM NAME = ${recvVmName}`)
      break
    case TELNET.VM_VC_UUID:
      var vmId = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, '')
      socket.emit('vm id', vmId)
      winston.info(`VM ID = ${vmId}`)
      break
    case TELNET.DO_PROXY:
      var dirAndUri = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, '')
      socket.emit('do proxy', dirAndUri)
      var direction = dirAndUri.substr(0, 1)
      var uri = dirAndUri.substr(1)
      winston.debug(`Proxy direction = ${direction}, uri = ${uri}`)
      sendVMWareOption(socket, TELNET.WILL_PROXY)
      break
    case TELNET.KNOWN_SUBOPTIONS_1:
      winston.debug(`recv known suboptions 1 from vm. options = ${valArray}`)
      // we only know how to get vm name
      var knownCommands = valArray.filter(val => { return supportedCommands.indexOf(val) != -1 })
      sendVMWareOption(socket, [TELNET.KNOWN_SUBOPTIONS_2].concat(knownCommands))
      if (knownCommands.indexOf(TELNET.GET_VM_NAME) != -1) {
        sendVMWareOption(socket, TELNET.GET_VM_NAME)
      }
      break
    default:
      winston.debug(`recv unknown suboptions from vm. options = ${valArray}`)
      sendVMWareOption(socket, [TELNET.UNKNOWN_SUBOPTIONS_2].concat(valArray))
      break
  }
  var ending = tBuffer.read(2) // IAC SE
  assert(ending[0] == TELNET.IAC && ending[1] == TELNET.SE)
}

function sendData(sockets, tBuffer) {
  assert(tBuffer instanceof TBuffer)
  assert(Array.isArray(sockets), 'sockets needs to be an array')
  try {
    var buffer = tBuffer.buffer.slice(tBuffer.index)
    if (buffer.length > 0) {
      sockets.forEach(s => {
        s.write(buffer)
      })
    }
  } catch (error) {
    winston.error(error)
  }
}

/**
 * Process all telnet commands in Buffer
 * 
 * @param {net.socket} socket - socket where data comes from
 * @param {TBuffer} tBuffer - TBuffer that has the data to be processed
 * 
 */
function processTelnetCommands(socket, tBuffer, supportedCommands) {
  assert(tBuffer instanceof TBuffer)
  try {
    var val = tBuffer.peek()
    if (typeof val === 'undefined') {
      //winston.debug('Buffer is done')
      return
    }
    if (val != TELNET.IAC) {
      //processVmData(socket, tBuffer)
      return
    }
    assert(val == TELNET.IAC)
    tBuffer.read()
    var command = tBuffer.read()
    switch (command) {
      case TELNET.WILL:
      case TELNET.DO:
        var subCommand = tBuffer.read()
        var yesResponse = command == TELNET.WILL ? TELNET.DO : TELNET.WILL
        var noResponse = command == TELNET.WILL ? TELNET.DONT : TELNET.WONT
        var response = supportedCommands.indexOf(subCommand) == -1 ? noResponse : yesResponse
        winston.debug(`Recv ${command} ${subCommand}, Send ${response} ${subCommand}`)
        sendTelnetCommand(socket, response, subCommand)
        break
      case TELNET.WONT:
        subCommand = tBuffer.read()
        winston.warn(`Recv wont ${subCommand} from ${socket.remoteAddress}`)
        break
      case TELNET.DONT:
        subCommand = tBuffer.read()
        winston.warn(`Recv dont ${subCommand} from ${socket.remoteAddress}`)
        break
      case TELNET.SB:
        subCommand = tBuffer.read()
        switch (subCommand) {
          case TELNET.VMWARE_TELNET_EXT:
            processVMWareSubOption(socket, tBuffer, supportedCommands)
            break
          default:
            winston.warn(`We don't support sub negotiation ${subCommand} from ${socket.remoteAddress}`)
            var subOptions = tBuffer.readUntil(TELNET.IAC)
            winston.warn(`sub options = ${subOptions}`)
            var ending = tBuffer.read(2) // IAC SE
            assert(ending[0] == TELNET.IAC && ending[1] == TELNET.SE)
            break
        }
        break
      case TELNET.SE:
        winston.warn('SE should be handled by SB already. This SE is extra! tBuffer = ', tBuffer)
        break
      case TELNET.NOP:
      case TELNET.BREAK:
      case TELNET.DM:
      case TELNET.IP:
      case TELNET.ABORT:
      case TELNET.AYT:
      case TELNET.EC:
      case TELNET.EL:
      case TELNET.GA:
        winston.warn(`We don't really support ${command} from ${socket.remoteAddress}.`)
        break
      case TELNET.IAC:
        winston.warn('Got data 255')
        break
      default:
        winston.warn(`We don't support ${command} from ${socket.remoteAddress}.`)
        break
    }
    processTelnetCommands(socket, tBuffer, supportedCommands)
  } catch (error) {
    winston.error(error)
  }
}

module.exports = {
  sendTelnetCommand: sendTelnetCommand,
  sendVMWareOption: sendVMWareOption,
  processVMWareSubOption: processVMWareSubOption,
  sendData: sendData,
  processTelnetCommands: processTelnetCommands
}