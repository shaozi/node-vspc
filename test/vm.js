const net = require('net')
const TELNET = require('../telnet_const')
const CONFIG = require('../config')


function createVm(vmName) {
  var client = net.createConnection({ host: CONFIG.redis.host, port: CONFIG.proxyListenPort }, () => {
    // 'connect' listener
    console.log(`${vmName} connected to proxy!`)
    client.write(Buffer.concat([
      Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.VMWARE_TELNET_EXT]),
      Buffer.from([TELNET.IAC, TELNET.SB, TELNET.VMWARE_TELNET_EXT, TELNET.VM_NAME]),
      Buffer.from(vmName),
      Buffer.from([TELNET.IAC, TELNET.SE])
    ]))
    client.write('world!\r\n')
  })
  client.on('data', (data) => {
    console.log(data)
    if (data.toString() == 'x') {
      client.end()
    }
  })
  client.on('end', () => {
    console.log('disconnected from server')
  })
}

var vmNames = []
for (var i = 0; i < 1000; i++) {
  vmNames.push(`VM ${i}`)
}
vmNames.map(createVm)
