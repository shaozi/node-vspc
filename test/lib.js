const net = require('net')
const TELNET = require('../telnet_const')
const CONFIG = require('../config')

function createVmConnection(vmName) {
  var vmConnection = net.createConnection({ host: CONFIG.redis.host, port: CONFIG.proxyListenPort }, () => {
    // 'connect' listener
    //console.log(`${vmName} connected to proxy!`)
    vmConnection.write(Buffer.concat([
      Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.VMWARE_TELNET_EXT]),
      Buffer.from([TELNET.IAC, TELNET.SB, TELNET.VMWARE_TELNET_EXT, TELNET.VM_NAME]),
      Buffer.from(vmName),
      Buffer.from([TELNET.IAC, TELNET.SE])
    ]))
    vmConnection.write('world!\r\n')
  })
  vmConnection.on('data', (data) => {
    //console.log(data)
    if (data.toString() == 'x') {
      vmConnection.end()
    }
  })
  vmConnection.on('end', () => {
    //console.log('disconnected from server')
  })
  return vmConnection
}

module.exports = {
  createVmConnection: createVmConnection
}