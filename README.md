Nodejs based VMWare VM serial console vSPC Proxy Server
=======================================================

Overview
--------

`node-vspc` is a Virtual Serial Port Concentrator (also known as a virtual serial port proxy) that makes use of the [VMware telnet extensions](http://www.vmware.com/support/developer/vc-sdk/visdk41pubs/vsp41_usingproxy_virtual_serial_ports.pdf).

Feature
-------

* Performance: Scales to thousands of VMs. (Tested with 4,000 with a 100 connections per second rate)
* Persistent telnet port for the same VM

Lineage
-------

It is inspired by [vSPC.py](https://github.com/isnotajoke/vSPC.py). However, that script cannot scale to more than 500 VMs due to the usage of python's build in `telnetlib.py`. With NodeJS's async nature, `node-vspc` can scale to multiple thousands of VMs.

Requirements
------------

* NodeJS 10
* Redis 4

Configure VM to connect serial console to proxy
-----------------------------------------------

In order to configure a VM to use the virtual serial port concentrator, you must be running ESXi 4.1+. You must also have a software license level that allows you to use networked serial ports.

First, add a networked virtual serial port to the VM. Configure it as follows:

    (*) Use Network
      (*) Server
      Port URI: node-vspc
      [X] Use Virtual Serial Port Concentrator:
      vSPC: telnet://hostname:proxy_port
NOTE: Direction MUST be Server

where hostname is the FQDN (or IP address) of the machine running the virtual serial port concentrator, and proxy_port is the port that you've configured the concentrator to listen for VM connections on.

Running the Concentrator
------------------------

Before start, create a `config.json` and set the desired options. See `config.sample.json` for details.

Then, start the concentrator by using command:

    node server.js

Getting the Telnet Port of a VM
-------------------------------

When a VM is powered on, it will telnet to the concentrator's proxy listen port. The proxy will create a telnet server listening on a port. Users can telnet to this port, and connect to the VM's serial console.

`node-vspc` manages the telnet ports in Redis. User can query Redis to figure out which telnet port is mapped to which VM. The following command get the port of a VM named `vm1` with id `993329f5-f353-4383-9a29-be60143f20d8`:

    redis-cli get 'Active:VM:Portvm1 (993329f5-f353-4383-9a29-be60143f20d8)'