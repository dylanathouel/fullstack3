/**
 * data-server.js – meeting data server
 * =====================================
 * Handles all CRUD operations on the user's meetings.
 * Communicates with MeetingsDB exclusively through the DB API.
 *
 * Authentication: every request must include an Authorization header
 *                 containing a valid token issued by AuthServer after login/register.
 *
 * REST API – endpoints:
 *   GET    /api/meetings            – fetch all meetings for the user
 *   GET    /api/meetings?search=... – free-text search across meetings
 *   GET    /api/meetings?date=...   – filter by date (YYYY-MM-DD)
 *   GET    /api/meetings/:id        – fetch a specific meeting
 *   POST   /api/meetings            – create a new meeting
 *   PUT    /api/meetings/:id        – update an existing meeting
 *   DELETE /api/meetings/:id        – delete a meeting
 */
const DataServer = (() => {

    /**
     * _authorize – extracts and validates the token from the request headers.
     */
    function _authorize(fxhr) {
        const token = fxhr._headers['Authorization'];
        if (!token) return null;
        return AuthServer.validateToken(token);
    }

    /**
     * _extractId – extracts an ID from a URL in the form /api/meetings/:id.
     */
    function _extractId(urlBase) {
        const parts = urlBase.split('/');
        const last = parts[parts.length - 1];
        return last === 'meetings' ? null : last;
    }

    /**
     * _parseQuery – extracts parameters from the URL query string.
     */
    function _parseQuery(url) {
        const qIndex = url.indexOf('?');
        return new URLSearchParams(qIndex !== -1 ? url.slice(qIndex + 1) : '');
    }

    /**
     * _validateMeeting – validates meeting data on the server side.
     * Performs the same checks as the client (defense-in-depth):
     *   – required fields are filled
     *   – date and time format is valid
     *   – date is not in the past
     *   – at least 2 participants
     */
    function _validateMeeting(data) {
        // ── Required fields ──
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

        // ── Date must not be in the past ──
        const now = new Date();
        const todayStr = [
            now.getFullYear(),
            // padStart ensures each component is always 2 digits
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');

        if (data.date < todayStr)
            return { valid: false, message: 'לא ניתן לקבוע פגישה בתאריך שכבר עבר' };

        // ── If the meeting is today – the time must be in the future ──
        if (data.date === todayStr) {
            const [h, m] = data.time.split(':').map(Number);
            const selectedTime = new Date();
            selectedTime.setHours(h, m, 0, 0);
            if (selectedTime <= now)
                return { valid: false, message: 'הפגישה היא היום – יש לבחור שעה שטרם עברה' };
        }

        // ── At least 2 participants ──
        const participantList = (data.participants || '')
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (participantList.length < 2)
            return { valid: false, message: 'יש להזין לפחות 2 משתתפים, מופרדים בפסיקים' };

        return { valid: true };
    }

    /**
     * _handleGetAll – GET /api/meetings (with optional search/filter).
     * Supports query parameters: ?search=... and ?date=...
     */
    function _handleGetAll(fxhr, sendResponse, userId) {
        const params = _parseQuery(fxhr.url);
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
     * Returns a specific meeting if it belongs to the user.
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
     * Validates data and adds a new meeting to the store.
     */
    function _handleCreate(fxhr, sendResponse, userId) {
        const body = JSON.parse(fxhr.data || '{}');
        const validation = _validateMeeting(body);

        if (!validation.valid) {
            sendResponse(fxhr, { status: 400, body: { error: validation.message } });
            return;
        }

        const newMeeting = MeetingsDB.add({
            userId,
            title: body.title.trim(),
            date: body.date,
            time: body.time,
            location: (body.location || '').trim(),
            participants: (body.participants || '').trim()
        });

        sendResponse(fxhr, { status: 201, body: { meeting: newMeeting } });
    }

    /**
     * _handleUpdate – PUT /api/meetings/:id.
     * Verifies the meeting belongs to the user, validates, then updates.
     */
    function _handleUpdate(fxhr, sendResponse, userId, id) {
        const existing = MeetingsDB.getById(id);
        if (!existing || existing.userId !== userId) {
            sendResponse(fxhr, { status: 404, body: { error: 'הפגישה לא נמצאה' } });
            return;
        }

        const body = JSON.parse(fxhr.data || '{}');
        // Merge existing data with the update for full validation
        const merged = { ...existing, ...body };

        const validation = _validateMeeting(merged);

        if (!validation.valid) {
            sendResponse(fxhr, { status: 400, body: { error: validation.message } });
            return;
        }

        const updated = MeetingsDB.update(id, {
            title: merged.title.trim(),
            date: merged.date,
            time: merged.time,
            location: (merged.location || '').trim(),
            participants: (merged.participants || '').trim()
        });

        sendResponse(fxhr, { status: 200, body: { meeting: updated } });
    }

    /**
     * _handleDelete – DELETE /api/meetings/:id.
     * Verifies the meeting belongs to the user and deletes it.
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

    /* ─── Public interface ─── */
    return {

        /**
         * register – registers the server on the network under the '/api' prefix.
         */
        register() {
            Network.register('/api', this);
        },

        /**
         * handleRequest – main entry point for the data server.
         * Validates the token and routes by method and URL.
         */
        handleRequest(fxhr, sendResponse) {
            // Authorisation check – every request requires a valid token
            const userId = _authorize(fxhr);
            if (!userId) {
                sendResponse(fxhr, { status: 401, body: { error: 'לא מורשה – נא להתחבר מחדש' } });
                return;
            }

            const urlBase = fxhr.url.split('?')[0];   // URL without query string
            const method = fxhr.method;
            const id = _extractId(urlBase);

            if (method === 'GET' && !id) _handleGetAll(fxhr, sendResponse, userId);
            else if (method === 'GET' && id) _handleGetOne(fxhr, sendResponse, userId, id);
            else if (method === 'POST') _handleCreate(fxhr, sendResponse, userId);
            else if (method === 'PUT' && id) _handleUpdate(fxhr, sendResponse, userId, id);
            else if (method === 'DELETE' && id) _handleDelete(fxhr, sendResponse, userId, id);
            else sendResponse(fxhr, { status: 400, body: { error: 'Bad request' } });
        }
    };

})();
