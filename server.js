const net = require('net');
const assert = require('assert')
const redis = require('redis')
const winston = require('winston')
const TBuffer = require('./TBuffer')

const CONFIG = require('./config')
const ProxyListenPort = CONFIG.proxyListenPort
const BasePort = CONFIG.telnetStartPort
const TotalPort = CONFIG.maxTelnetPorts
const FreePorts = "FreePorts"

if (!process.env.NODE_ENV || process.env.NODE_ENV != "production") {
  // use time stamp in winston when developing
  winston.remove(winston.transports.Console)
  winston.add(winston.transports.Console, { 'timestamp': true, colorize: true })
}



const Commands = {
  IAC: 255, // Interpret as Command
  DONT: 254, // you are not to use option
  DO: 253, // please use option
  WONT: 252, // I won't use option
  WILL: 251, // I will use option
  SB: 250, // sub-negotiation
  GA: 249, // Go-ahead
  EL: 248, // Erase line
  EC: 247, // Erase character
  AYT: 246, // Are you there
  AO: 245, // Abort output (but let prog finish)
  IP: 244, // Interrupt (permanently)
  BREAK: 243,
  DM: 242, // Data mark
  NOP: 241,
  SE: 240, // End sub-negotiation
  EOR: 239, // End of record (transparent mode)
  ABORT: 238, // Abort process
  SUSP: 237, // Suspend process
  EOF: 236, // End of file
  SYNCH: 242,

  //https://www.vmware.com/support/developer/vc-sdk/visdk41pubs/vsp41_usingproxy_virtual_serial_ports.pdf
  VMOTION_BEGIN: 40,
  VMOTION_GOAHEAD: 41,
  VMOTION_NOTNOW: 43,
  VMOTION_PEER: 44,
  VMOTION_PEER_OK: 45,
  VMOTION_COMPLETE: 46,
  VMOTION_ABORT: 48,

  VM_VC_UUID: 80,
  GET_VM_VC_UUID: 81,
  VM_NAME: 82,
  GET_VM_NAME: 83,
  VM_BIOS_UUID: 84,
  GET_VM_BIOS_UUID: 85,
  VM_LOCATION_UUID: 86,
  GET_VM_LOCATION_UUID: 87,

  VMWARE_TELNET_EXT: 232, // VMWARE-TELNET-EXT 232,
  WONT_PROXY: 73, // DO-PROXY, 73
  WILL_PROXY: 71, // DO-PROXY, 71
  DO_PROXY: 70, // DO-PROXY, 70
  UNKNOWN_SUBOPTIONS_2: 3,
  UNKNOWN_SUBOPTIONS_1: 2,
  KNOWN_SUBOPTIONS_2: 1,
  KNOWN_SUBOPTIONS_1: 0

}
// https://www.iana.org/assignments/telnet-options/telnet-options.xhtml
const Options = {

  OPT_BINARY: 0,  // RFC 856
  OPT_ECHO: 1,  // RFC 857
  OPT_SUPPRESS_GO_AHEAD: 3,  // RFC 858
  OPT_STATUS: 5,  // RFC 859
  OPT_TIMING_MARK: 6,  // RFC 860
  OPT_TTYPE: 24, // RFC 930, 1091
  OPT_WINDOW_SIZE: 31, // RFC 1073
  OPT_LINE_MODE: 34, // RFC 1184
  OPT_AUTHENTICATION: 37, // RFC 2941
  OPT_NEW_ENVIRON: 39, // RFC 1572
  OPT_COMPRESS2: 86, // http://www.zuggsoft.com/zmud/mcp.htm
  TELQUAL_IS: 0,
  TELQUAL_SEND: 1
}

const SupportedCommands = [
  Options.OPT_BINARY,
  Options.OPT_ECHO,
  Options.OPT_SUPPRESS_GO_AHEAD,

  Commands.KNOWN_SUBOPTIONS_1,
  Commands.KNOWN_SUBOPTIONS_2,
  Commands.UNKNOWN_SUBOPTIONS_1,
  Commands.UNKNOWN_SUBOPTIONS_2,

  Commands.VMWARE_TELNET_EXT,
  Commands.WONT_PROXY,
  Commands.WILL_PROXY,
  Commands.DO_PROXY,
  Commands.GET_VM_NAME,
  Commands.VM_NAME
]


const redisClient = redis.createClient({
  host: CONFIG.redis.host,
  port: CONFIG.redis.port,
  password: CONFIG.redis.password
})

redisClient.del(FreePorts)
for (var i = 0; i < TotalPort; i++) {
  redisClient.rpush(FreePorts, BasePort + i)
}

// index with vm name
// vmName: {port:1234, telnetServer: server, vmSocket: vmsocket, sockets: [u1, u2, u3]}
var vmProxies = {}

const server = net.createServer((c) => {
  // 'connection' listener
  c.setNoDelay()
  winston.info('VM connected');
  c.on('end', () => {
    tearDownTelnetServer()
    winston.info(`VM ${vmName} disconnected`);
  })
  sendDoDontWillWont(c, Commands.WILL, Options.OPT_BINARY)
  sendDoDontWillWont(c, Commands.WILL, Options.OPT_SUPPRESS_GO_AHEAD)
  sendDoDontWillWont(c, Commands.WILL, Options.OPT_ECHO)
  sendDoDontWillWont(c, Commands.DO, Options.OPT_BINARY)
  sendDoDontWillWont(c, Commands.DO, Options.OPT_SUPPRESS_GO_AHEAD)


  var vmName = ""
  var vmId = ""

  function createTelnetServer() {
    winston.info(`Create Telnet Server for VM ${vmName}`)
    const telnetServer = net.createServer(socket => {
      winston.info(`Client connected to VM ${vmName}`)
      socket.setNoDelay()
      // send telnet options
      sendDoDontWillWont(socket, Commands.WILL, Options.OPT_BINARY)
      sendDoDontWillWont(socket, Commands.WILL, Options.OPT_SUPPRESS_GO_AHEAD)
      sendDoDontWillWont(socket, Commands.WILL, Options.OPT_ECHO)
      sendDoDontWillWont(socket, Commands.DO, Options.OPT_BINARY)
      sendDoDontWillWont(socket, Commands.DO, Options.OPT_SUPPRESS_GO_AHEAD)
      var record = vmProxies[vmName]
      assert(record)
      record.sockets.push(socket)
      socket.on('end', () => {
        var record = vmProxies[vmName]
        assert(record)
        var index = record.sockets.indexOf(socket)
        assert(index != -1)
        record.sockets.splice(index, 1)
        winston.info(`Client disconnected from VM ${vmName}`)
      })
      socket.on('data', (data) => {
        var tBuffer = new TBuffer(data)
        tBuffer.print()
        if (data.readUInt8(0) == Commands.IAC) {
          processBuffer(socket, tBuffer)
        } else {
          processData(socket, tBuffer)
        }
      })
    })
    telnetServer.on('error', (err) => {
      tearDownTelnetServer()
      throw err;
    })
    redisClient.rpop(FreePorts, (error, port) => {
      if (error) {
        winston.error(`Redis ran into error on pop port`)
        throw error
      }
      if (port ==  null) {
        winston.error(`${vmName} cannot create telnet server. Free ports run out!!!`)
      } else {
        port = parseInt(port)
        telnetServer.listen(port, () => {
          vmProxies[vmName] = {
            port: port,
            telnetServer: telnetServer,
            vmSocket: c,
            sockets: []
          }
          redisClient.set(`VM:${vmName}`, port)
          winston.info(`VM ${vmName} listening on port ${port}`);
        })
      }
    })
  }

  function tearDownTelnetServer() {
    var record = vmProxies[vmName]
    assert(record)
    record.sockets.forEach(sockets => {
      sockets.end()
    })
    record.telnetServer.close()
    delete vmProxies[vmName]
    
    redisClient.del(`VM:${vmName}`)
    redisClient.rpush(FreePorts, record.port)
    
    winston.info(`Telnet Server tear down for ${vmName}`)
  }

  function sendDoDontWillWont(socket, action, cmd) {
    socket.write(Buffer.from([Commands.IAC, action, cmd]))
  }

  function sendVMWareOption(socket, options) {
    socket.write(Buffer.from([Commands.IAC, Commands.SB, Commands.VMWARE_TELNET_EXT].concat(
      options, Commands.IAC, Commands.SE
    )))
  }

  function processVMWareSubOption(socket, tBuffer) {
    assert(tBuffer instanceof TBuffer)
    winston.debug('process vmware sub negotiation')
    var option = tBuffer.read()
    var valArray = tBuffer.readUntil(Commands.IAC)
    switch (option) {
      case Commands.VM_NAME:
        var recvVmName = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, "")
        winston.info(`VM NAME = ${recvVmName}`)
        if (vmName === "") {
          vmName = recvVmName
          createTelnetServer()
        } else {
          winston.info('got vm name again')
          if (vmName != recvVmName) {
            winston.error(`New name : ${recvVmName} != old name: ${vmName}`)
          }
        }
        break
      case Commands.VM_VC_UUID:
        vmId = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, "")
        winston.info(`VM ID = ${vmId}`)
        break
      case Commands.DO_PROXY:
        var dirAndUri = valArray.reduce((pv, cv) => { return pv + String.fromCharCode(cv) }, "")
        var direction = dirAndUri.substr(0, 1)
        var uri = dirAndUri.substr(1)
        winston.debug(`Proxy direction = ${direction}, uri = ${uri}`)
        sendVMWareOption(socket, Commands.WILL_PROXY)
        break
      case Commands.KNOWN_SUBOPTIONS_1:
        winston.debug(`recv known suboptions 1 from vm. options = ${valArray}`)
        // we only know how to get vm name
        var knownCommands = valArray.filter(val => { return SupportedCommands.indexOf(val) != -1 })
        sendVMWareOption(socket, [Commands.KNOWN_SUBOPTIONS_2].concat(knownCommands))
        if (knownCommands.indexOf(Commands.GET_VM_NAME) != -1) {
          sendVMWareOption(socket, Commands.GET_VM_NAME)
        }
        break
      default:
        winston.debug(`recv unknown suboptions from vm. options = ${valArray}`)
        sendVMWareOption(socket, [Commands.UNKNOWN_SUBOPTIONS_2].concat(valArray))
        break
    }
    var ending = tBuffer.read(2) // IAC SE
    assert(ending[0] == Commands.IAC && ending[1] == Commands.SE)
  }

  function processData(socket, tBuffer) {
    assert(tBuffer instanceof TBuffer)
    try {
      var record = vmProxies[vmName]
      assert(record)
      if (socket == record.vmSocket) {
        //winston.debug('Write vm data to clients')
        record.sockets.forEach(s => {
          s.write(tBuffer.buffer)
        })
      } else {
        //winston.info('Write client data to vm')
        record.vmSocket.write(tBuffer.buffer)
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
      assert(val == Commands.IAC)

      var command = tBuffer.read()
      switch (command) {
        case Commands.WILL:
        case Commands.DO:
          var subCommand = tBuffer.read()
          var yesResponse = command == Commands.WILL ? Commands.DO : Commands.WILL
          var noResponse = command == Commands.WILL ? Commands.DONT : Commands.WONT
          var response = SupportedCommands.indexOf(subCommand) == -1 ? noResponse : yesResponse
          winston.debug(`Recv ${command} ${subCommand}, Send ${response} ${subCommand}`)
          sendDoDontWillWont(socket, response, subCommand)
          break
        case Commands.WONT:
        case Commands.DONT:
          subCommand = tBuffer.read()
          winston.warn(`Recv dont or wont ${subCommand}`)
          break
        case Commands.SB:
          subCommand = tBuffer.read()
          switch (subCommand) {
            case Commands.VMWARE_TELNET_EXT:
              processVMWareSubOption(socket, tBuffer)
              break
            default:
              winston.warn(`We don't support sub negotiation ${subCommand}`)
              var subOptions = tBuffer.readUntil(Commands.IAC)
              winston.warn(`sub options = ${subOptions}`)
              var ending = tBuffer.read(2) // IAC SE
              assert(ending[0] == Commands.IAC && ending[1] == Commands.SE)
              break
          }
          break
        case Commands.SE:
        case Commands.NOP:
        case Commands.BREAK:
        case Commands.DM:
        case Commands.IP:
        case Commands.ABORT:
        case Commands.AYT:
        case Commands.EC:
        case Commands.EL:
        case Commands.GA:
          winston.warn(`We don't support ${command}.`)
          break
        case Commands.IAC:
          winston.warn('Got data 255')
          break
        default:
          winston.warn(`We don't support ${command}.`)
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
    if (data.readUInt8(0) == Commands.IAC) {
      processBuffer(c, tBuffer)
    } else {
      processData(c, tBuffer)
    }
  })

})

server.on('error', (err) => {
  server.close()
  throw err;
})


server.listen(ProxyListenPort, () => {
  winston.info(`vSPC Proxy server bound to port ${ProxyListenPort}`);
})
