// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


const net = require('net')
const assert = require('assert')
const winston = require('winston')
const TBuffer = require('./TBuffer')
const TELNET = require('./telnet_const')
const vmTelnet = require('./vmtelnet')
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


function sendTelnetInitCmds(socket) {
  vmTelnet.sendTelnetCommand(socket, TELNET.WILL, TELNET.OPT_BINARY)
  vmTelnet.sendTelnetCommand(socket, TELNET.WILL, TELNET.OPT_SUPPRESS_GO_AHEAD)
  vmTelnet.sendTelnetCommand(socket, TELNET.WILL, TELNET.OPT_ECHO)
  vmTelnet.sendTelnetCommand(socket, TELNET.DO, TELNET.OPT_BINARY)
  vmTelnet.sendTelnetCommand(socket, TELNET.DO, TELNET.OPT_SUPPRESS_GO_AHEAD)
}

const server = net.createServer((vmSocket) => {
  var telnetServer = null
  var proxyInfo = null
  var vmName = ''
  winston.info('VM connected')

  sendTelnetInitCmds(vmSocket)

  function createTelnetServer() {
    winston.info(`Create Telnet Server for VM ${vmName}`)
    const server = net.createServer(clientSocket => {
      winston.info(`Client connected to VM ${vmName}`)
      clientSocket.setNoDelay()
      // send telnet options
      sendTelnetInitCmds(clientSocket)
            
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
      clientSocket.on('close', () => {
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
        vmTelnet.processTelnetCommands(clientSocket, tBuffer, SupportedCommands)
        if (tBuffer.hasMoreData()) {
          vmTelnet.sendData([vmSocket], tBuffer)
        }
      })

      clientSocket.on('error', (error) => {
        winston.error('Error on client socket', error)
        clientSocket.destroy()
        if (proxyInfo) {
          var index = proxyInfo.sockets.indexOf(clientSocket)
          if (index != -1) {
            proxyInfo.sockets.splice(index, 1)
            winston.info(`Client disconnected from VM ${vmName}`)
          }
        }
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
    vmTelnet.processTelnetCommands(vmSocket, tBuffer, SupportedCommands)
    if (tBuffer.hasMoreData()) {
      if (proxyInfo) {
        vmTelnet.sendData(proxyInfo.sockets, tBuffer)
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
