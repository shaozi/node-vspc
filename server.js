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


// index with vm name
// vmName: {port:1234, telnetServer: server, vmSocket: vmsocket, sockets: [u1, u2, u3]}
var vmProxies = {}
var telnetServer

const server = net.createServer((c) => {
  // 'connection' listener
  c.setNoDelay()
  winston.info('VM connected')
  c.on('end', () => {
    tearDownTelnetServer()
    winston.info(`VM ${vmName} disconnected`)
  })
  c.on('vm name', (recvVmName) => {
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

  sendDoDontWillWont(c, TELNET.WILL, TELNET.OPT_BINARY)
  sendDoDontWillWont(c, TELNET.WILL, TELNET.OPT_SUPPRESS_GO_AHEAD)
  sendDoDontWillWont(c, TELNET.WILL, TELNET.OPT_ECHO)
  sendDoDontWillWont(c, TELNET.DO, TELNET.OPT_BINARY)
  sendDoDontWillWont(c, TELNET.DO, TELNET.OPT_SUPPRESS_GO_AHEAD)


  var vmName = ''
  var vmId = ''

  function createTelnetServer() {
    winston.info(`Create Telnet Server for VM ${vmName}`)
    const telnetServer = net.createServer(socket => {
      winston.info(`Client connected to VM ${vmName}`)
      socket.setNoDelay()
      // send telnet options
      sendDoDontWillWont(socket, TELNET.WILL, TELNET.OPT_BINARY)
      sendDoDontWillWont(socket, TELNET.WILL, TELNET.OPT_SUPPRESS_GO_AHEAD)
      sendDoDontWillWont(socket, TELNET.WILL, TELNET.OPT_ECHO)
      sendDoDontWillWont(socket, TELNET.DO, TELNET.OPT_BINARY)
      sendDoDontWillWont(socket, TELNET.DO, TELNET.OPT_SUPPRESS_GO_AHEAD)
      var record = vmProxies[vmName]
      assert(record)
      record.sockets.push(socket)
      socket.on('end', () => {
        var record = vmProxies[vmName]
        if (record && record.sockets) {
          var index = record.sockets.indexOf(socket)
          if (index != -1) {
            record.sockets.splice(index, 1)
            winston.info(`Client disconnected from VM ${vmName}`)
          }
        }
      })
      socket.on('data', (data) => {
        var tBuffer = new TBuffer(data)
        tBuffer.print()
        if (data.readUInt8(0) == TELNET.IAC) {
          processBuffer(socket, tBuffer)
        } else {
          processData(socket, tBuffer)
        }
      })
    })
    telnetServer.on('error', (err) => {
      tearDownTelnetServer()
      throw err
    })
    portmanager.findFreePort((port) => {
      if (port == null) {
        winston.error(`${vmName} cannot create telnet server. No TCP ports available!!!`)
      } else {
        port = parseInt(port)
        telnetServer.listen(port, () => {
          vmProxies[vmName] = {
            port: port,
            telnetServer: telnetServer,
            vmSocket: c,
            sockets: []
          }
          portmanager.recordPortForVm(vmName, port)
          winston.info(`VM ${vmName} listening on port ${port}`)
        })
      }
    })
  }

  function tearDownTelnetServer() {
    var record = vmProxies[vmName]
    if (record){
      record.sockets.forEach(sockets => {
        sockets.end()
      })
    }
    if (telnetServer) {
      telnetServer.close()
    }
    delete vmProxies[vmName]

    portmanager.freePortOfVm(vmName, record.port)

    winston.info(`Telnet Server tear down for ${vmName}`)
  }

  function sendDoDontWillWont(socket, action, cmd) {
    socket.write(Buffer.from([TELNET.IAC, action, cmd]))
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
        /*
        if (vmName === '') {
          vmName = recvVmName
          createTelnetServer()
        } else {
          winston.info('got vm name again')
          if (vmName != recvVmName) {
            winston.error(`New name : ${recvVmName} != old name: ${vmName}`)
          }
        }
        */
        break
      case TELNET.VM_VC_UUID:
        vmId = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, '')
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

  function processData(socket, tBuffer) {
    assert(tBuffer instanceof TBuffer)
    try {
      var buffer = tBuffer.buffer.slice(tBuffer.index)
      var record = vmProxies[vmName]
      if (record) {
        if (socket == record.vmSocket) {
          //winston.debug('Write vm data to clients')
          record.sockets.forEach(s => {
            s.write(buffer)
          })
        } else {
          //winston.info('Write client data to vm')
          record.vmSocket.write(buffer)
        }
      }
    } catch (error) {
      winston.error(error)
      return
    }
  }

  function processBuffer(socket, tBuffer) {
    assert(tBuffer instanceof TBuffer)
    try {
      var val = tBuffer.read()
      if (typeof val === 'undefined') {
        //winston.debug('Buffer is done')
        return
      }
      if (val != TELNET.IAC) {
        processData(socket, tBuffer)
        return
      }
      assert(val == TELNET.IAC)

      var command = tBuffer.read()
      switch (command) {
        case TELNET.WILL:
        case TELNET.DO:
          var subCommand = tBuffer.read()
          var yesResponse = command == TELNET.WILL ? TELNET.DO : TELNET.WILL
          var noResponse = command == TELNET.WILL ? TELNET.DONT : TELNET.WONT
          var response = SupportedCommands.indexOf(subCommand) == -1 ? noResponse : yesResponse
          winston.debug(`Recv ${command} ${subCommand}, Send ${response} ${subCommand}`)
          sendDoDontWillWont(socket, response, subCommand)
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
      processBuffer(socket, tBuffer)
    } catch (error) {
      winston.error(error)
      return
    }
  }

  c.on('data', (data) => {
    var tBuffer = new TBuffer(data)
    tBuffer.print()
    if (data.readUInt8(0) == TELNET.IAC) {
      processBuffer(c, tBuffer)
    } else {
      processData(c, tBuffer)
    }
  })

})

server.on('error', (err) => {
  server.close()
  throw err
})


server.listen(ProxyListenPort, () => {
  winston.info(`vSPC Proxy server listen on port ${ProxyListenPort}`)
})
