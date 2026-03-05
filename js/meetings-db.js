/**
 * meetings-db.js – מאגר נתוני פגישות (DB API)
 * ===============================================
 * מספק פעולות CRUD על פגישות השמורות ב-LocalStorage.
 *
 * חשוב: פניות למאגר זה מבוצעות רק מקוד שרת (DataServer).
 * קוד לקוח לא יפנה ישירות לאובייקט זה.
 *
 * מבנה רשומת פגישה:
 * {
 *   id:           string,   // מזהה ייחודי
 *   userId:       string,   // ID של המשתמש הבעלים
 *   title:        string,   // נושא הפגישה (חובה)
 *   date:         string,   // תאריך בפורמט YYYY-MM-DD (חובה)
 *   time:         string,   // שעה בפורמט HH:MM (חובה)
 *   location:     string,   // מיקום (אופציונלי)
 *   participants: string,   // משתתפים – מחרוזת חופשית (אופציונלי)
 *   createdAt:    string    // ISO timestamp
 * }
 */
const MeetingsDB = (() => {

    const STORAGE_KEY = 'meetings_app_data';   // מפתח ה-LocalStorage

    /**
     * _getAll – שולף את כל רשומות הפגישות מה-LocalStorage.
     * @returns {Array}
     */
    function _getAll() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    /**
     * _saveAll – שומר מערך פגישות מעודכן ב-LocalStorage.
     * @param {Array} meetings
     */
    function _saveAll(meetings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
    }

    /**
     * _generateId – יוצר מזהה ייחודי לפגישה חדשה.
     * @returns {string}
     */
    function _generateId() {
        return 'm_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    }

    /* ─── ממשק ציבורי (DB API) ─── */
    return {

        /**
         * init – מאתחל את המאגר עם נתוני seed אם הוא עדיין ריק.
         * נקרא פעם אחת בטעינת האפליקציה.
         * @param {Array} seedMeetings
         */
        init(seedMeetings = []) {
            if (!localStorage.getItem(STORAGE_KEY)) {
                _saveAll(seedMeetings);
                console.info('[MeetingsDB] Initialized with seed data.');
            }
        },

        /**
         * getAllByUser – שולף את כל הפגישות של משתמש מסוים,
         * ממוינות לפי תאריך ושעה (עולה).
         * @param {string} userId
         * @returns {Array}
         */
        getAllByUser(userId) {
            return _getAll()
                .filter(m => m.userId === userId)
                .sort((a, b) => {
                    const da = a.date + 'T' + a.time;
                    const db = b.date + 'T' + b.time;
                    return da.localeCompare(db);
                });
        },

        /**
         * getById – שולף פגישה ספציפית לפי ID.
         * @param {string} id
         * @returns {object|null}
         */
        getById(id) {
            return _getAll().find(m => m.id === id) || null;
        },

        /**
         * search – מחפש פגישות של משתמש לפי מחרוזת חופשית.
         * מחפש בשדות: נושא, מיקום, משתתפים.
         * @param {string} userId
         * @param {string} query
         * @returns {Array}
         */
        search(userId, query) {
            const q = query.toLowerCase();
            return _getAll()
                .filter(m =>
                    m.userId === userId && (
                        m.title.toLowerCase().includes(q)           ||
                        (m.location     && m.location.toLowerCase().includes(q))     ||
                        (m.participants && m.participants.toLowerCase().includes(q))
                    )
                )
                .sort((a, b) => {
                    const da = a.date + 'T' + a.time;
                    const db = b.date + 'T' + b.time;
                    return da.localeCompare(db);
                });
        },

        /**
         * filterByDate – מחזיר פגישות של משתמש בתאריך מסוים.
         * @param {string} userId
         * @param {string} date – בפורמט YYYY-MM-DD
         * @returns {Array}
         */
        filterByDate(userId, date) {
            return _getAll()
                .filter(m => m.userId === userId && m.date === date)
                .sort((a, b) => a.time.localeCompare(b.time));
        },

        /**
         * add – מוסיף פגישה חדשה למאגר.
         * @param {object} meetingData – נתוני הפגישה (ללא id ו-createdAt)
         * @returns {object} הפגישה החדשה עם ה-ID שנוצר
         */
        add(meetingData) {
            const meetings   = _getAll();
            const newMeeting = {
                ...meetingData,
                id:        _generateId(),
                createdAt: new Date().toISOString()
            };
            meetings.push(newMeeting);
            _saveAll(meetings);
            return newMeeting;
        },

        /**
         * update – מעדכן שדות של פגישה קיימת לפי ID.
         * @param {string} id
         * @param {object} updates
         * @returns {object|null} הפגישה המעודכנת, או null אם לא נמצאה
         */
        update(id, updates) {
            const meetings = _getAll();
            const index    = meetings.findIndex(m => m.id === id);
            if (index === -1) return null;
            meetings[index] = {
                ...meetings[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            _saveAll(meetings);
            return meetings[index];
        },

        /**
         * delete – מוחק פגישה לפי ID.
         * @param {string} id
         * @returns {boolean}
         */
        delete(id) {
            const meetings = _getAll();
            const index    = meetings.findIndex(m => m.id === id);
            if (index === -1) return false;
            meetings.splice(index, 1);
            _saveAll(meetings);
            return true;
        }
    };

})();
