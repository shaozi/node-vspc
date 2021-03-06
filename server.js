// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


const net = require('net')
const assert = require('assert')
const logger = require('./lib/logger')
const TBuffer = require('./lib/TBuffer')
const TELNET = require('./lib/telnet_const')
const vmTelnet = require('./lib/vmtelnet')
const portmanager = require('./lib/portmanager')

const CONFIG = require('./config')
const ProxyListenPort = CONFIG.proxyListenPort

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

// call this only once when starting
portmanager.init()

const server = net.createServer((vmSocket) => {
  var telnetServer = null
  var proxyInfo = null
  var vmName = ''
  logger.info('VM connected')

  async function createTelnetServer() {
    logger.info(`Create Telnet Server for VM ${vmName}`)
    
    const createdServer = net.createServer(clientSocket => {
      logger.info(`Client connected to VM ${vmName}`)
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
            logger.info(`Client end event disconnected from VM ${vmName}`)
          }
        }
      })
      clientSocket.on('close', () => {
        if (proxyInfo) {
          var index = proxyInfo.sockets.indexOf(clientSocket)
          if (index != -1) {
            proxyInfo.sockets.splice(index, 1)
            logger.info(`Client close event disconnected from VM ${vmName}`)
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
        logger.error(`Error on client socket for VM ${vmName}`, error)
        clientSocket.destroy()
        if (proxyInfo) {
          logger.error(`Error on client socket for VM ${vmName}, total ${proxyInfo.sockets.length} client sockets in proxyInfo.`)
          var index = proxyInfo.sockets.indexOf(clientSocket)
          if (index != -1) {
            let errSocket = proxyInfo.sockets[index]
            logger.error(`Error client socket remote address: ${errSocket.remoteAddress}, remote port: ${errSocket.remotePort}`)
            proxyInfo.sockets.splice(index, 1)
            logger.error(`Client destroied from VM ${vmName}`)
          }
        }
      })
    })

    createdServer.on('error', async (err) => {
      logger.error(`telnet server runs in to error: ${err}. Tear down`)
      await tearDownTelnetServer()
      //throw err
    })

    try {
      var port = await portmanager.allocPort(vmName)
      logger.info(`allocate port ${port} for ${vmName}`)
      port = parseInt(port)
      if (!port) {
        // don't create anything
        return null
      }
      createdServer.listen(port, () => {
        proxyInfo = {
          port: port,
          sockets: []
        }
        logger.info(`VM ${vmName} listening on port ${port}`)
      })
      return createdServer
    } catch (error) {
      logger.error(error)
      return null
    }
  }

  async function tearDownTelnetServer() {
    if (telnetServer) {
      telnetServer.close((error) => {
        if (error) {
          logger.error(`telnet server encounter error when closing: ${error}`)
        }
        if (proxyInfo) {
          proxyInfo.sockets.forEach(sockets => {
            sockets.end()
          })
          proxyInfo = null
          logger.info(`All connections to ${vmName} are closed and record is deleted.`)
        } else {
          logger.warn(`Error while tearing down telnet server for ${vmName}, record does not exist!`)
        }
        telnetServer = null
        logger.info(`Telnet Server tear down for ${vmName}`)
      })
    } else {
      logger.warn(`Error while tearing down telnet server for ${vmName}, telnet server does not exist!`)
    }
    await portmanager.freePort(vmName)
  }

  vmSocket.on('vm name', async (recvVmName) => {
    if (vmName === '') {
      vmName = recvVmName
      telnetServer = await createTelnetServer()
    } else {
      logger.info('got vm name again')
      if (vmName != recvVmName) {
        logger.error(`New name : ${recvVmName} != old name: ${vmName}`)
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

  vmSocket.on('end', async () => {
    logger.info(`VM ${vmName} receives END and is disconnected`)
    await tearDownTelnetServer()
  })

  vmSocket.on('error', async (error) => {
    logger.error(`VM ${vmName} receives ERROR: ${error}`)
    logger.error(error)
    await tearDownTelnetServer()
  })

  vmSocket.setNoDelay()
  sendTelnetInitCmds(vmSocket)

})

server.on('error', (err) => {
  logger.error(`SERVER runs into error! ${err}`)
  server.close()
  throw err
})

server.listen(ProxyListenPort, () => {
  logger.info(`vSPC Proxy server listen on port ${ProxyListenPort}`)
})
