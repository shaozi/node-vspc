// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


const net = require('net')
const assert = require('assert')
const winston = require('winston')
const TBuffer = require('./TBuffer')
const TELNET = require('./telnet_const')
const portmanager = require('./portmanager')

const CONFIG = require('./config')
const ProxyListenPort = CONFIG.proxyListenPort


if (!process.env.NODE_ENV || process.env.NODE_ENV != 'production') {
  // use time stamp in winston when developing
  winston.remove(winston.transports.Console)
  winston.add(winston.transports.Console, { 'timestamp': true, colorize: true })
}

const SupportedCommands = [
  TELNET.OPT_BINARY,
  TELNET.OPT_ECHO,
  TELNET.OPT_SUPPRESS_GO_AHEAD,

  TELNET.KNOWN_SUBOPTIONS_1,
  TELNET.KNOWN_SUBOPTIONS_2,
  TELNET.UNKNOWN_SUBOPTIONS_1,
  TELNET.UNKNOWN_SUBOPTIONS_2,

  TELNET.VMWARE_TELNET_EXT,
  TELNET.WONT_PROXY,
  TELNET.WILL_PROXY,
  TELNET.DO_PROXY,
  TELNET.GET_VM_NAME,
  TELNET.VM_NAME
]


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

function processVMWareSubOption(socket, tBuffer) {
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
      var knownCommands = valArray.filter(val => { return SupportedCommands.indexOf(val) != -1 })
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
function processTelnetCommands(socket, tBuffer) {
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
        var response = SupportedCommands.indexOf(subCommand) == -1 ? noResponse : yesResponse
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
            processVMWareSubOption(socket, tBuffer)
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
    processTelnetCommands(socket, tBuffer)
  } catch (error) {
    winston.error(error)
  }
}


const server = net.createServer((vmSocket) => {
  var telnetServer = null
  var proxyInfo = null
  var vmName = ''
  winston.info('VM connected')

  sendTelnetCommand(vmSocket, TELNET.WILL, TELNET.OPT_BINARY)
  sendTelnetCommand(vmSocket, TELNET.WILL, TELNET.OPT_SUPPRESS_GO_AHEAD)
  sendTelnetCommand(vmSocket, TELNET.WILL, TELNET.OPT_ECHO)
  sendTelnetCommand(vmSocket, TELNET.DO, TELNET.OPT_BINARY)
  sendTelnetCommand(vmSocket, TELNET.DO, TELNET.OPT_SUPPRESS_GO_AHEAD)


  function createTelnetServer() {
    winston.info(`Create Telnet Server for VM ${vmName}`)
    const server = net.createServer(clientSocket => {
      winston.info(`Client connected to VM ${vmName}`)
      clientSocket.setNoDelay()
      // send telnet options
      sendTelnetCommand(clientSocket, TELNET.WILL, TELNET.OPT_BINARY)
      sendTelnetCommand(clientSocket, TELNET.WILL, TELNET.OPT_SUPPRESS_GO_AHEAD)
      sendTelnetCommand(clientSocket, TELNET.WILL, TELNET.OPT_ECHO)
      sendTelnetCommand(clientSocket, TELNET.DO, TELNET.OPT_BINARY)
      sendTelnetCommand(clientSocket, TELNET.DO, TELNET.OPT_SUPPRESS_GO_AHEAD)
      
      assert(proxyInfo != null)
      proxyInfo.sockets.push(clientSocket)

      clientSocket.on('end', () => {
        if (proxyInfo) {
          var index = proxyInfo.sockets.indexOf(clientSocket)
          if (index != -1) {
            proxyInfo.sockets.splice(index, 1)
            winston.info(`Client disconnected from VM ${vmName}`)
          }
        }
      })

      clientSocket.on('data', (data) => {
        var tBuffer = new TBuffer(data)
        tBuffer.print()
        processTelnetCommands(clientSocket, tBuffer)
        if (tBuffer.hasMoreData()) {
          sendData([vmSocket], tBuffer)
        }
      })

      clientSocket.on('error', (error) => {
        winston.error('Error on client socket', error)
      })
    })
    server.on('error', (err) => {
      tearDownTelnetServer()
      throw err
    })
    portmanager.findFreePort((port) => {
      if (port == null) {
        winston.error(`${vmName} cannot create telnet server. No TCP ports available!!!`)
      } else {
        port = parseInt(port)
        server.listen(port, () => {
          proxyInfo = {
            port: port,
            sockets: []
          }
          //vmProxies[vmName] = proxyInfo
          portmanager.recordPortForVm(vmName, port)
          winston.info(`VM ${vmName} listening on port ${port}`)
        })
      }
    })
    return server
  }

  function tearDownTelnetServer() {
    //if (vmProxies[vmName]) {
    //  delete vmProxies[vmName]
    //}
    if (proxyInfo) {
      proxyInfo.sockets.forEach(sockets => {
        sockets.end()
      })
      portmanager.freePortOfVm(vmName, proxyInfo.port)
      winston.info(`All connections to ${vmName} are closed and record is deleted.`)
    } else {
      winston.warn(`Error while tearing down telnet server for ${vmName}, record does not exist!`)
    }
    if (telnetServer) {
      telnetServer.close()
      winston.info(`Telnet Server tear down for ${vmName}`)
    } else {
      winston.warn(`Error while tearing down telnet server for ${vmName}, telnet server does not exist!`)
    }
  }


  vmSocket.setNoDelay()
  
  vmSocket.on('vm name', (recvVmName) => {
    if (vmName === '') {
      vmName = recvVmName
      telnetServer = createTelnetServer()
    } else {
      winston.info('got vm name again')
      if (vmName != recvVmName) {
        winston.error(`New name : ${recvVmName} != old name: ${vmName}`)
      }
    }
  })

  vmSocket.on('data', (data) => {
    var tBuffer = new TBuffer(data)
    tBuffer.print()
    processTelnetCommands(vmSocket, tBuffer)
    if (tBuffer.hasMoreData()) {
      if (proxyInfo) {
        sendData(proxyInfo.sockets, tBuffer)
      }
    }
  })

  vmSocket.on('end', () => {
    tearDownTelnetServer()
    winston.info(`VM ${vmName} disconnected`)
  })
  
  vmSocket.on('error', (error) => {
    tearDownTelnetServer()
    winston.error(`VM ${vmName} has error`, error)
  })
})

server.on('error', (err) => {
  server.close()
  throw err
})

server.listen(ProxyListenPort, () => {
  winston.info(`vSPC Proxy server listen on port ${ProxyListenPort}`)
})
