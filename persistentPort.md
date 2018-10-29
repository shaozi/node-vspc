# Persistent Port for vm

1. vm is identified by `vmName`
2. Three group of keys:
    * the active:vmName:port (key value)
    * the saved:vmName:port table (key value)
    * the free port table (list)
3. When a vm connects to vpc server, the following steps are taken to find a port:
    1. Check if active:vmName:port exists
        1. if yes, return the port and indicate no need to create a new telnet server
        2. if no, check if saved:vmName:port exists
            1. if yes, check if port exists in free port table and remove it (LREM == 1?)
                1. if yes:
                    * add vmName:port to active table
                    * return port
                    * indicate need to create a new telnet server listening on port
                2. if no:
                    * lpop a port from free port table
                    * add vmName:port to active table
                    * replace vmName:port in saved table
                    * return that port
                    * indicate need to create a new telnet server listening on port
            2. if no:
                * shift a port from free port table
                * add vmName:port to active table
                * add vmName:port in saved table
                * return that port
                * indicate need to create a new telnet server listening on port
4. When a vm disconnects from vpc server, do the following:
    * delete vmName:port from active table
    * rpush port back to free port table
