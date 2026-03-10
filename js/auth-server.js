/**
 * auth-server.js – user authentication server
 * ======================================
 * Handles user login and registration.
 * Communicates with UsersDB exclusively through the DB API.
 *
 * Endpoints:
 *   POST /auth/login    – log in an existing user
 *   POST /auth/register – register a new user
 *   POST /auth/logout   – log out (invalidate token)
 *
 * Token-based authentication:
 *   After a successful login/register a unique session token is created.
 *   The token is stored in memory (activeSessions) and returned to the client.
 *   DataServer uses AuthServer.validateToken to authenticate incoming requests.
 */
const AuthServer = (() => {

    /**
     * activeSessions – in-memory store of active session tokens.
     * Structure: { [token]: userId }
     * Reset on every page refresh (as required in the simulation).
     */
    const activeSessions = {};

    /**
     * _generateToken – generates a unique session token.

     */
    function _generateToken() {
        return 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    }

    /**
     * _authenticate – validates a username and password against UsersDB.
     */
    function _authenticate(username, password) {
        const user = UsersDB.getByUsername(username);
        if (!user || user.password !== password) return null;
        return user;
    }

    /**
     * _validateRegistration – validates registration data.
     */
    function _validateRegistration(data) {
        if (!data.username || data.username.trim().length < 3)
            return { valid: false, message: 'שם משתמש חייב להכיל לפחות 3 תווים' };
        if (!/^[a-zA-Z0-9_]+$/.test(data.username))
            return { valid: false, message: 'שם משתמש יכול להכיל אותיות באנגלית, ספרות וקו תחתון בלבד' };
        if (!data.email || !data.email.includes('@'))
            return { valid: false, message: 'כתובת אימייל לא תקינה' };
        if (!data.password || data.password.length < 6)
            return { valid: false, message: 'סיסמה חייבת להכיל לפחות 6 תווים' };
        if (UsersDB.usernameExists(data.username))
            return { valid: false, message: 'שם המשתמש כבר קיים במערכת' };
        return { valid: true };
    }

    /**
     * _handleLogin – handles POST /auth/login.
     * Validates credentials, creates a token and returns it together with
     * the user details (password excluded).
     */
    function _handleLogin(fxhr, sendResponse) {
        const body = JSON.parse(fxhr.data || '{}');

        if (!body.username || !body.password) {
            sendResponse(fxhr, { status: 400, body: { error: 'שם משתמש וסיסמה הם שדות חובה' } });
            return;
        }

        const user = _authenticate(body.username, body.password);
        if (!user) {
            sendResponse(fxhr, { status: 401, body: { error: 'שם משתמש או סיסמה שגויים' } });
            return;
        }

        const token = _generateToken();
        activeSessions[token] = user.id;

        // Return user details without the password field
        const { password: _p, ...safeUser } = user;
        sendResponse(fxhr, { status: 200, body: { token, user: safeUser } });
    }

    /**
     * _handleRegister – handles POST /auth/register.
     * Validates data, creates a new user, creates a token and returns it.
     */
    function _handleRegister(fxhr, sendResponse) {
        const body       = JSON.parse(fxhr.data || '{}');
        const validation = _validateRegistration(body);

        if (!validation.valid) {
            sendResponse(fxhr, { status: 400, body: { error: validation.message } });
            return;
        }

        const newUser = UsersDB.add({
            username: body.username.trim(),
            email:    body.email.trim(),
            password: body.password
        });

        const token = _generateToken();
        activeSessions[token] = newUser.id;

        const { password: _p, ...safeUser } = newUser;
        sendResponse(fxhr, { status: 201, body: { token, user: safeUser } });
    }

    /**
     * _handleLogout – handles POST /auth/logout.
     * Removes the token from activeSessions.
     */
    function _handleLogout(fxhr, sendResponse) {
        const token = fxhr._headers['Authorization'];
        if (token && activeSessions[token]) {
            // Delete the token property to invalidate the session
            delete activeSessions[token];
        }
        sendResponse(fxhr, { status: 200, body: { message: 'התנתקת בהצלחה' } });
    }

    /* ─── Public interface ─── */
    return {

        /**
         * register – registers the server on the network under the '/auth' prefix.
         */
        register() {
            Network.register('/auth', this);
        },

        /**
         * validateToken – checks whether a token exists and is valid.
         * Used by DataServer to authenticate every incoming request.
         */
        validateToken(token) {
            return activeSessions[token] || null;
        },

        /**
         * restoreSession – restores an existing session after a page refresh.
         * Called by App when a valid token is found in sessionStorage.
         * Without this call, activeSessions would be empty after a refresh and
         * validateToken would return null even though the token is still in the browser.
         */
        restoreSession(token, userId) {
            activeSessions[token] = userId;
        },

        /**
         * handleRequest – main entry point for the server.
         * Routes incoming requests (from Network) to the appropriate handler function.
         */
        handleRequest(fxhr, sendResponse) {
            const { url, method } = fxhr;

            if (url === '/auth/login'    && method === 'POST') return _handleLogin(fxhr, sendResponse);
            if (url === '/auth/register' && method === 'POST') return _handleRegister(fxhr, sendResponse);
            if (url === '/auth/logout'   && method === 'POST') return _handleLogout(fxhr, sendResponse);

            sendResponse(fxhr, { status: 404, body: { error: 'Endpoint not found' } });
        }
    };

})();
