var lib = require('./lib')

test('Create 2000 vmconnections', () => {
  var vmNames = []
  for (var i = 0; i< 2000; i++) {
    vmNames.push(`VM (${i})`)
  }
  vmNames.map(vmName => {
    var con = lib.createVmConnection(vmName)
    setTimeout(()=> {
      con.close()
    }, 1000)
  })
})