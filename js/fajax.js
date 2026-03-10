/**
 * fajax.js – FXMLHttpRequest class
 * ===================================
 * Simulates the browser's built-in XMLHttpRequest class.
 * Instead of sending real HTTP requests, it forwards the request
 * to the simulated network (Network) which routes it to the appropriate server.
 *
 * Usage:
 *   const xhr = new FXMLHttpRequest();
 *   xhr.open('POST', '/auth/login');
 *   xhr.setRequestHeader('Content-Type', 'application/json');
 *   xhr.onload  = () => { ... };   // called when a response arrives (any status)
 *   xhr.onerror = () => { ... };   // called when the network "drops" the message
 *   xhr.send(JSON.stringify({ username, password }));
 */
class FXMLHttpRequest {

    /* Constructor – initialises all fields to default values */
    constructor() {
        this.method       = null;   // HTTP method (GET / POST / PUT / DELETE)
        this.url          = null;   // target URL
        this.data         = null;   // request body (JSON string)
        this.status       = null;   // HTTP response code received from the server
        this.responseText = null;  // response body as a JSON string
        this.onload       = null;   // callback – called when a response is received from the server
        this.onerror      = null;   // callback – called when the network drops the message
        this._headers     = {};     // request headers (Authorization, Content-Type, ...)
    }

    /**
     * open – sets the HTTP method and target URL for the request.
     * Must be called before send.
     */
    open(method, url) {
        this.method = method.toUpperCase();
        this.url    = url;
    }

    /**
     * setRequestHeader – adds a header to the request (e.g. Authorization, Content-Type).
     * Must be called after open and before send.
     */
    setRequestHeader(key, value) {
        this._headers[key] = value;
    }

    /**
     * send – forwards the request to the simulated network.
     * After this call the request has "left" the client; the response will
     * arrive via onload / onerror.
     */
    send(data = null) {
        if (data !== null) {
            this.data = data;
        }
        // Passes the entire object to the network; the network handles routing, delay and drop
        Network.transmit(this);
    }

    /**
     * _handleResponse – called by the network when the response arrives from the server.
     * Updates status and responseText then fires the appropriate callback.
     * (Internal method – do not call directly from client code)
     */
    _handleResponse(responseObj) {
        this.status       = responseObj.status;
        this.responseText = JSON.stringify(responseObj.body);
        // onload is always called when a response exists – the client checks this.status itself
        if (typeof this.onload === 'function') {
            this.onload();
        }
    }

    /**
     * _handleNetworkError – called by the network when the frame is "dropped".
     * Resets status and fires onerror.
     * (Internal method – do not call directly from client code)
     */
    _handleNetworkError() {
        this.status       = 0;
        this.responseText = null;
        if (typeof this.onerror === 'function') {
            this.onerror();
        }
    }
}
