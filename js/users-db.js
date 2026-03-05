/**
 * users-db.js – מאגר נתוני משתמשים (DB API)
 * =============================================
 * מספק פעולות CRUD על נתוני משתמשים השמורים ב-LocalStorage.
 *
 * חשוב: פניות למאגר זה מבוצעות רק מקוד שרת (AuthServer).
 * קוד לקוח לא יפנה ישירות לאובייקט זה.
 *
 * מבנה רשומת משתמש:
 * {
 *   id:        string,   // מזהה ייחודי
 *   username:  string,   // שם משתמש (ייחודי)
 *   email:     string,   // כתובת אימייל
 *   password:  string,   // סיסמה (טקסט גולמי – לצרכי הדמיה בלבד)
 *   createdAt: string    // ISO timestamp
 * }
 */
const UsersDB = (() => {

    const STORAGE_KEY = 'meetings_app_users';  // מפתח ה-LocalStorage

    /**
     * _getAll – שולף את כל רשומות המשתמשים מה-LocalStorage.
     * @returns {Array} מערך משתמשים
     */
    function _getAll() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    /**
     * _saveAll – שומר מערך משתמשים מעודכן ב-LocalStorage.
     * @param {Array} users
     */
    function _saveAll(users) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }

    /**
     * _generateId – יוצר מזהה ייחודי למשתמש חדש.
     * @returns {string}
     */
    function _generateId() {
        return 'u_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    }

    /* ─── ממשק ציבורי (DB API) ─── */
    return {

        /**
         * init – מאתחל את המאגר עם נתוני seed אם הוא עדיין ריק.
         * נקרא פעם אחת בטעינת האפליקציה.
         * @param {Array} seedUsers – מערך משתמשי ברירת מחדל
         */
        init(seedUsers = []) {
            if (!localStorage.getItem(STORAGE_KEY)) {
                _saveAll(seedUsers);
                console.info('[UsersDB] Initialized with seed data.');
            }
        },

        /**
         * getById – שולף משתמש לפי ID.
         * @param {string} id
         * @returns {object|null}
         */
        getById(id) {
            return _getAll().find(u => u.id === id) || null;
        },

        /**
         * getByUsername – שולף משתמש לפי שם משתמש (case-sensitive).
         * @param {string} username
         * @returns {object|null}
         */
        getByUsername(username) {
            return _getAll().find(u => u.username === username) || null;
        },

        /**
         * usernameExists – בודק אם שם משתמש כבר תפוס.
         * @param {string} username
         * @returns {boolean}
         */
        usernameExists(username) {
            return _getAll().some(u => u.username === username);
        },

        /**
         * add – מוסיף משתמש חדש למאגר.
         * מוסיף שדות id ו-createdAt אוטומטית.
         * @param {{ username, email, password }} userData
         * @returns {object} המשתמש החדש עם ה-ID שנוצר
         */
        add(userData) {
            const users   = _getAll();
            const newUser = {
                ...userData,
                id:        _generateId(),
                createdAt: new Date().toISOString()
            };
            users.push(newUser);
            _saveAll(users);
            return newUser;
        },

        /**
         * update – מעדכן שדות של משתמש קיים לפי ID.
         * @param {string} id
         * @param {object} updates – שדות לעדכון
         * @returns {object|null} המשתמש המעודכן, או null אם לא נמצא
         */
        update(id, updates) {
            const users = _getAll();
            const index = users.findIndex(u => u.id === id);
            if (index === -1) return null;
            users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
            _saveAll(users);
            return users[index];
        },

        /**
         * delete – מוחק משתמש לפי ID.
         * @param {string} id
         * @returns {boolean} true אם נמחק, false אם לא נמצא
         */
        delete(id) {
            const users = _getAll();
            const index = users.findIndex(u => u.id === id);
            if (index === -1) return false;
            users.splice(index, 1);
            _saveAll(users);
            return true;
        }
    };

})();
