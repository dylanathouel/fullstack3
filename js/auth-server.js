/**
 * auth-server.js – שרת אימות משתמשים
 * ======================================
 * מטפל בכניסה (login) ורישום (register) של משתמשים.
 * עובד מול UsersDB דרך ה-DB API בלבד.
 *
 * נקודות-קצה (Endpoints):
 *   POST /auth/login    – כניסת משתמש קיים
 *   POST /auth/register – רישום משתמש חדש
 *   POST /auth/logout   – התנתקות (ביטול טוקן)
 *
 * אימות מבוסס-טוקן:
 *   אחרי כניסה/רישום מוצלחים נוצר טוקן session ייחודי.
 *   הטוקן נשמר בזיכרון (activeSessions) ומוחזר ללקוח.
 *   DataServer משתמש ב-AuthServer.validateToken כדי לאמת בקשות.
 */
const AuthServer = (() => {

    /**
     * activeSessions – מאגר טוקני session פעילים בזיכרון.
     * מבנה: { [token]: userId }
     * מאופס בכל רענון דף (כנדרש במערכת הדמיה).
     */
    const activeSessions = {};

    /**
     * _generateToken – מייצר טוקן session ייחודי.
     * @returns {string}
     */
    function _generateToken() {
        return 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    }

    /**
     * _authenticate – בודק שם משתמש וסיסמה מול UsersDB.
     * @param {string} username
     * @param {string} password
     * @returns {object|null} אובייקט המשתמש אם תקין, null אחרת
     */
    function _authenticate(username, password) {
        const user = UsersDB.getByUsername(username);
        if (!user || user.password !== password) return null;
        return user;
    }

    /**
     * _validateRegistration – בודק תקינות נתוני רישום.
     * @param {{ username, email, password }} data
     * @returns {{ valid: boolean, message?: string }}
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
     * _handleLogin – מטפל ב-POST /auth/login.
     * מאמת פרטים, יוצר טוקן ומחזיר אותו יחד עם פרטי המשתמש (ללא סיסמה).
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

        // מחזיר את פרטי המשתמש ללא שדה הסיסמה
        const { password: _p, ...safeUser } = user;
        sendResponse(fxhr, { status: 200, body: { token, user: safeUser } });
    }

    /**
     * _handleRegister – מטפל ב-POST /auth/register.
     * מאמת נתונים, יוצר משתמש חדש, יוצר טוקן ומחזיר אותו.
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
     * _handleLogout – מטפל ב-POST /auth/logout.
     * מוחק את הטוקן מ-activeSessions.
     */
    function _handleLogout(fxhr, sendResponse) {
        const token = fxhr._headers['Authorization'];
        if (token && activeSessions[token]) {
            // מחק את המאפיין הטוקן כדי לבטל את ה-session
            delete activeSessions[token];
        }
        sendResponse(fxhr, { status: 200, body: { message: 'התנתקת בהצלחה' } });
    }

    /* ─── ממשק ציבורי ─── */
    return {

        /**
         * register – רושם את השרת ברשת התקשורת תחת prefix '/auth'.
         */
        register() {
            Network.register('/auth', this);
        },

        /**
         * validateToken – בודק אם טוקן קיים ותקף.
         * משמש את DataServer לאימות כל בקשה נכנסת.
         * @param {string} token
         * @returns {string|null} userId אם הטוקן תקף, null אחרת
         */
        validateToken(token) {
            return activeSessions[token] || null;
        },

        /**
         * restoreSession – משחזר session קיים לאחר רענון דף.
         * נקרא על-ידי App כאשר נמצא טוקן תקף ב-sessionStorage.
         * ללא קריאה זו, activeSessions יהיה ריק אחרי רענון ו-validateToken
         * יחזיר null למרות שהטוקן עדיין שמור בדפדפן.
         * @param {string} token
         * @param {string} userId
         */
        restoreSession(token, userId) {
            activeSessions[token] = userId;
        },

        /**
         * handleRequest – נקודת הכניסה הראשית של השרת.
         * מנתב בקשות נכנסות (מה-Network) לפונקציית הטיפול המתאימה.
         * @param {FXMLHttpRequest} fxhr
         * @param {Function} sendResponse – פונקציה שמחזירה תגובה ללקוח דרך הרשת
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
