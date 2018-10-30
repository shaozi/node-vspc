/* for eslint */
/* global test */

var lib = require('./lib')

var total = 4000
var connectionRate = 100
var duration = 5

test(`Create and tear down ${total} vmconnections @ ${connectionRate} connections/second (should be done on a different host)`, (done) => {
  var vmNames = []

  for (var i = 0; i < total; i++) {
    vmNames.push(`VM (${i})`)
  }
  var count = 0
  vmNames.map((vmName, i) => {
    setTimeout(() => {
      var con = lib.createVmConnection(vmName)
      setTimeout(() => {
        con.end()
        count++
        if (count >= total) done()
      }, duration * 1000)
    }, i * 1000 / connectionRate)
  })
}, (duration + total / connectionRate) * 1000 * 2)