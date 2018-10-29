/* for eslint */
/* global test */

var lib = require('./lib')

test('Create and tear down 2000 vmconnections (should be done on a different host)', (done) => {
  var vmNames = []
  var total = 500
  for (var i = 0; i < total; i++) {
    vmNames.push(`VM (${i})`)
  }
  var count = 0
  vmNames.map(vmName => {
    var con = lib.createVmConnection(vmName)
    setTimeout(() => {
      con.end()
      count++
      if (count >= total) done()
    }, 5000)
  })
}, 10000)