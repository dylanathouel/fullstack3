/**
 * network.js – simulated network module
 * ==================================
 * Responsible for transferring messages between clients and servers and back.
 * Currently operates with delay and packet-drop enabled.
 * The delay and drop behaviour can be toggled by changing the constants below.
 */
const Network = (() => {

    /* ─── Configuration constants ─── */
    const MIN_DELAY = 1000;      // minimum delay in ms (0 = immediate)
    const MAX_DELAY = 3000;      // maximum delay in ms (0 = immediate)
    const DROP_RATE = 0.1;      // drop probability (0 = no drops)

    /* ─── Routing table ─── */
    // Maps a URL prefix (string) to the server object that handles it
    const routingTable = {};

    /**
     * _randomDelay – calculates a random delay between MIN_DELAY and MAX_DELAY.
     */
    function _randomDelay() {
        return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    }

    /**
     * _isDropped – determines whether a message should be dropped.
     * Returns false when DROP_RATE is 0.
     */
    function _isDropped() {
        return DROP_RATE > 0 && Math.random() < DROP_RATE;
    }

    /**
     * _findServer – searches the routing table for a server that handles the given URL.
     * Checks whether the URL starts with one of the registered prefixes.
     */
    function _findServer(url) {
        for (const prefix in routingTable) {
            if (url.startsWith(prefix)) {
                return routingTable[prefix];
            }
        }
        return null;
    }

    /**
     * _sendResponse – sends a response from a server to a client through the network.
     * Passed to the server as a parameter so the server does not need to know about Network.
     */
    function _sendResponse(fxhr, responseObj) {
        const delay = _randomDelay();
        setTimeout(() => {
            if (_isDropped()) {
                console.log(`[Network] ↓ Response DROPPED  (${fxhr.method} ${fxhr.url})`);
                fxhr._handleNetworkError();
                return;
            }
            console.log(`[Network] ↓ Response OK  status=${responseObj.status}  (${fxhr.method} ${fxhr.url})`);
            fxhr._handleResponse(responseObj);
        }, delay);
    }

    /* ─── Public interface ─── */
    return {

        /**
         * register – registers a server on the network for a given URL prefix.
         * After registration, every request whose URL starts with urlPrefix is routed to this server.
         */
        register(urlPrefix, server) {
            routingTable[urlPrefix] = server;
            console.log(`[Network] Registered server for prefix: ${urlPrefix}`);
        },

        /**
         * transmit – forwards a request from the client to the appropriate server.
         * Called from FXMLHttpRequest.send().
         */
        transmit(fxhr) {
            const delay = _randomDelay();
            console.log(`[Network] ↑ Transmitting  (${fxhr.method} ${fxhr.url})`);

            setTimeout(() => {
                if (_isDropped()) {
                    console.log(`[Network] ↑ Request DROPPED  (${fxhr.method} ${fxhr.url})`);
                    fxhr._handleNetworkError();
                    return;
                }

                const server = _findServer(fxhr.url);
                if (!server) {
                    console.error(`[Network] No server found for URL: ${fxhr.url}`);
                    fxhr._handleResponse({ status: 404, body: { error: 'Server not found' } });
                    return;
                }

                // Passes _sendResponse to handleRequest so the server can return a response through us
                server.handleRequest(fxhr, _sendResponse);
            }, delay);
        },

        /**
         * getDropRate – returns the current drop rate (for debugging).
         */
        getDropRate() {
            return DROP_RATE;
        }
    };

})();
