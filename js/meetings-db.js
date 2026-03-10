/**
 * meetings-db.js – meeting data store (DB API)
 * ===============================================
 * Provides CRUD operations on meetings stored in LocalStorage.
 *
 * Important: calls to this store are made only from server code (DataServer).
 * Client code must not access this object directly.
 *
 * Meeting record structure:
 * {
 *   id:           string,   // unique identifier
 *   userId:       string,   // ID of the owning user
 *   title:        string,   // meeting subject (required)
 *   date:         string,   // date in YYYY-MM-DD format (required)
 *   time:         string,   // time in HH:MM format (required)
 *   location:     string,   // location (optional)
 *   participants: string,   // participants – free-form string (optional)
 *   createdAt:    string    // ISO timestamp
 * }
 */
const MeetingsDB = (() => {

    const STORAGE_KEY = 'meetings_app_data';   // LocalStorage key

    /**
     * _getAll – retrieves all meeting records from LocalStorage.
     */
    function _getAll() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    /**
     * _saveAll – saves an updated meetings array to LocalStorage.
     */
    function _saveAll(meetings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
    }

    /**
     * _generateId – creates a unique identifier for a new meeting.
     */
    function _generateId() {
        return 'm_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    }

    /* ─── Public interface (DB API) ─── */
    return {

        /**
         * init – initialises the store with seed data if it is still empty.
         * Called once at application startup.
         */
        init(seedMeetings = []) {
            if (!localStorage.getItem(STORAGE_KEY)) {
                _saveAll(seedMeetings);
                console.log('[MeetingsDB] Initialized with seed data.');
            }
        },

        /**
         * getAllByUser – retrieves all meetings belonging to a given user,
         * sorted by date and time (ascending).
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
         * getById – retrieves a specific meeting by ID.
         */
        getById(id) {
            return _getAll().find(m => m.id === id) || null;
        },

        /**
         * search – searches a user's meetings using a free-text query.
         * Searches across: title, location, participants.
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
         * filterByDate – returns a user's meetings on a specific date.
         */
        filterByDate(userId, date) {
            return _getAll()
                .filter(m => m.userId === userId && m.date === date)
                .sort((a, b) => a.time.localeCompare(b.time));
        },

        /**
         * add – adds a new meeting to the store.
         */
        add(meetingData) {
            const meetings   = _getAll();
            const newMeeting = {
                ...meetingData,
                id:        _generateId(),
                // Auto-generated creation timestamp in UTC (Zulu time)
                createdAt: new Date().toISOString()
            };
            meetings.push(newMeeting);
            _saveAll(meetings);
            return newMeeting;
        },

        /**
         * update – updates fields of an existing meeting by ID.
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
         * delete – deletes a meeting by ID.
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
