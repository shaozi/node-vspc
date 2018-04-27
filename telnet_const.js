module.exports = {
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
  KNOWN_SUBOPTIONS_1: 0,


  // https://www.iana.org/assignments/telnet-options/telnet-options.xhtml

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