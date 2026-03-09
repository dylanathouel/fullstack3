/**
 * data-server.js – שרת נתוני פגישות
 * =====================================
 * מטפל בכל פעולות ה-CRUD על פגישות המשתמש.
 * עובד מול MeetingsDB דרך ה-DB API בלבד.
 *
 * אימות: כל בקשה חייבת לכלול כותרת Authorization עם טוקן תקף
 *        (שהוצא על-ידי AuthServer לאחר כניסה/רישום).
 *
 * REST API – נקודות-קצה:
 *   GET    /api/meetings            – שליפת כל הפגישות של המשתמש
 *   GET    /api/meetings?search=... – חיפוש חופשי בפגישות
 *   GET    /api/meetings?date=...   – סינון לפי תאריך (YYYY-MM-DD)
 *   GET    /api/meetings/:id        – שליפת פגישה ספציפית
 *   POST   /api/meetings            – הוספת פגישה חדשה
 *   PUT    /api/meetings/:id        – עדכון פגישה קיימת
 *   DELETE /api/meetings/:id        – מחיקת פגישה
 */
const DataServer = (() => {

    /**
     * _authorize – מחלץ ומאמת טוקן מכותרות הבקשה.
     * @returns {string|null} userId אם מורשה, null אחרת
     */
    function _authorize(fxhr) {
        const token = fxhr._headers['Authorization'];
        if (!token) return null;
        return AuthServer.validateToken(token);
    }

    /**
     * _extractId – מחלץ ID מ-URL בפורמט /api/meetings/:id.
     * @returns {string|null} ID אם קיים, null אם ה-URL הוא /api/meetings
     */
    function _extractId(urlBase) {
        const parts = urlBase.split('/');
        const last  = parts[parts.length - 1];
        return last === 'meetings' ? null : last;
    }

    /**
     * _parseQuery – מחלץ פרמטרים מ-query string של ה-URL.
     * @returns {URLSearchParams}
     */
    function _parseQuery(url) {
        const qIndex = url.indexOf('?');
        return new URLSearchParams(qIndex !== -1 ? url.slice(qIndex + 1) : '');
    }

    /**
     * _validateMeeting – בודק תקינות נתוני פגישה בצד השרת.
     * מבצע אותן בדיקות כמו הלקוח (defense-in-depth):
     *   – שדות חובה מלאים
     *   – פורמט תאריך ושעה תקין
     *   – תאריך לא בעבר
     *   – לפחות 2 משתתפים
     * @returns {{ valid: boolean, message?: string }}
     */
    function _validateMeeting(data) {
        // ── שדות חובה ──
        if (!data.title || data.title.trim().length === 0)
            return { valid: false, message: 'נושא הפגישה הוא שדה חובה' };

        if (!data.date)
            return { valid: false, message: 'תאריך הפגישה הוא שדה חובה' };

        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date))
            return { valid: false, message: 'פורמט תאריך לא תקין (נדרש YYYY-MM-DD)' };

        if (!data.time)
            return { valid: false, message: 'שעת הפגישה היא שדה חובה' };

        if (!/^\d{2}:\d{2}$/.test(data.time))
            return { valid: false, message: 'פורמט שעה לא תקין (נדרש HH:MM)' };

        // ── תאריך לא בעבר ──
        const now      = new Date();
        const todayStr = [
            now.getFullYear(),
            // מוסיפים ספרות של אפסים כדי להשלים בלכ השדות ל-2 תווים
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');

        if (data.date < todayStr)
            return { valid: false, message: 'לא ניתן לקבוע פגישה בתאריך שכבר עבר' };

        // ── אם הפגישה היום – השעה חייבת להיות בעתיד ──
        if (data.date === todayStr) {
            const [h, m]       = data.time.split(':').map(Number);
            const selectedTime = new Date();
            selectedTime.setHours(h, m, 0, 0);
            if (selectedTime <= now)
                return { valid: false, message: 'הפגישה היא היום – יש לבחור שעה שטרם עברה' };
        }

        // ── לפחות 2 משתתפים ──
        const participantList = (data.participants || '')
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (participantList.length < 2)
            return { valid: false, message: 'יש להזין לפחות 2 משתתפים, מופרדים בפסיקים' };

        return { valid: true };
    }

    /**
     * _handleGetAll – GET /api/meetings (עם חיפוש/סינון אופציונלי).
     * תומך בפרמטרים: ?search=... ו-?date=...
     */
    function _handleGetAll(fxhr, sendResponse, userId) {
        const params     = _parseQuery(fxhr.url);
        const searchTerm = params.get('search');
        const dateFilter = params.get('date');

        let meetings;
        if (searchTerm) {
            meetings = MeetingsDB.search(userId, searchTerm);
        } else if (dateFilter) {
            meetings = MeetingsDB.filterByDate(userId, dateFilter);
        } else {
            meetings = MeetingsDB.getAllByUser(userId);
        }

        sendResponse(fxhr, { status: 200, body: { meetings } });
    }

    /**
     * _handleGetOne – GET /api/meetings/:id.
     * מחזיר פגישה ספציפית אם שייכת למשתמש.
     */
    function _handleGetOne(fxhr, sendResponse, userId, id) {
        const meeting = MeetingsDB.getById(id);
        if (!meeting || meeting.userId !== userId) {
            sendResponse(fxhr, { status: 404, body: { error: 'הפגישה לא נמצאה' } });
            return;
        }
        sendResponse(fxhr, { status: 200, body: { meeting } });
    }

    /**
     * _handleCreate – POST /api/meetings.
     * מאמת נתונים ומוסיף פגישה חדשה למאגר.
     */
    function _handleCreate(fxhr, sendResponse, userId) {
        const body       = JSON.parse(fxhr.data || '{}');
        const validation = _validateMeeting(body);

        if (!validation.valid) {
            sendResponse(fxhr, { status: 400, body: { error: validation.message } });
            return;
        }

        const newMeeting = MeetingsDB.add({
            userId,
            title:        body.title.trim(),
            date:         body.date,
            time:         body.time,
            location:     (body.location     || '').trim(),
            participants: (body.participants  || '').trim()
        });

        sendResponse(fxhr, { status: 201, body: { meeting: newMeeting } });
    }

    /**
     * _handleUpdate – PUT /api/meetings/:id.
     * מוודא שהפגישה שייכת למשתמש, מאמת ומעדכן.
     */
    function _handleUpdate(fxhr, sendResponse, userId, id) {
        const existing = MeetingsDB.getById(id);
        if (!existing || existing.userId !== userId) {
            sendResponse(fxhr, { status: 404, body: { error: 'הפגישה לא נמצאה' } });
            return;
        }

        const body       = JSON.parse(fxhr.data || '{}');
        // מיזוג נתונים קיימים עם העדכון לצורך ולידציה מלאה
        const merged     = { ...existing, ...body };
        
        const validation = _validateMeeting(merged);

        if (!validation.valid) {
            sendResponse(fxhr, { status: 400, body: { error: validation.message } });
            return;
        }

        const updated = MeetingsDB.update(id, {
            title:        merged.title.trim(),
            date:         merged.date,
            time:         merged.time,
            location:     (merged.location     || '').trim(),
            participants: (merged.participants  || '').trim()
        });

        sendResponse(fxhr, { status: 200, body: { meeting: updated } });
    }

    /**
     * _handleDelete – DELETE /api/meetings/:id.
     * מוודא שהפגישה שייכת למשתמש ומוחקת.
     */
    function _handleDelete(fxhr, sendResponse, userId, id) {
        const existing = MeetingsDB.getById(id);
        if (!existing || existing.userId !== userId) {
            sendResponse(fxhr, { status: 404, body: { error: 'הפגישה לא נמצאה' } });
            return;
        }

        MeetingsDB.delete(id);
        sendResponse(fxhr, { status: 200, body: { message: 'הפגישה נמחקה בהצלחה' } });
    }

    /* ─── ממשק ציבורי ─── */
    return {

        /**
         * register – רושם את השרת ברשת התקשורת תחת prefix '/api'.
         */
        register() {
            Network.register('/api', this);
        },

        /**
         * handleRequest – נקודת הכניסה הראשית של שרת הנתונים.
         * מאמת טוקן ומנתב לפי method ו-URL.
         */
        handleRequest(fxhr, sendResponse) {
            // בדיקת הרשאה – כל בקשה דורשת טוקן תקף
            const userId = _authorize(fxhr);
            if (!userId) {
                sendResponse(fxhr, { status: 401, body: { error: 'לא מורשה – נא להתחבר מחדש' } });
                return;
            }

            const urlBase = fxhr.url.split('?')[0];   // URL ללא query string
            const method  = fxhr.method;
            const id      = _extractId(urlBase);

            if      (method === 'GET'    && !id) _handleGetAll(fxhr, sendResponse, userId);
            else if (method === 'GET'    &&  id) _handleGetOne(fxhr, sendResponse, userId, id);
            else if (method === 'POST')           _handleCreate(fxhr, sendResponse, userId);
            else if (method === 'PUT'    &&  id) _handleUpdate(fxhr, sendResponse, userId, id);
            else if (method === 'DELETE' &&  id) _handleDelete(fxhr, sendResponse, userId, id);
            else    sendResponse(fxhr, { status: 400, body: { error: 'Bad request' } });
        }
    };

})();
