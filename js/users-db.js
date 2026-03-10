/**
 * users-db.js – user data store (DB API)
 * =============================================
 * Provides CRUD operations on user data stored in LocalStorage.
 *
 * Important: calls to this store are made only from server code (AuthServer).
 * Client code must not access this object directly.
 *
 * User record structure:
 * {
 *   id:        string,   // unique identifier
 *   username:  string,   // username (unique)
 *   email:     string,   // email address
 *   password:  string,   // password (plain text – for simulation purposes only)
 *   createdAt: string    // ISO timestamp
 * }
 */
const UsersDB = (() => {

    const STORAGE_KEY = 'meetings_app_users';  // LocalStorage key

    /**
     * _getAll – retrieves all user records from LocalStorage.
     */
    function _getAll() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    /**
     * _saveAll – saves an updated users array to LocalStorage.
     */
    function _saveAll(users) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }

    /**
     * _generateId – creates a unique identifier for a new user.
     */
    function _generateId() {
        return 'u_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    }

    /* ─── Public interface (DB API) ─── */
    return {

        /**
         * init – initialises the store with seed data if it is still empty.
         * Called once at application startup.
         */
        init(seedUsers = []) {
            if (!localStorage.getItem(STORAGE_KEY)) {
                _saveAll(seedUsers);
                console.log('[UsersDB] Initialized with seed data.');
            }
        },

        /**
         * getById – retrieves a user by ID.
         */
        getById(id) {
            return _getAll().find(u => u.id === id) || null;
        },

        /**
         * getByUsername – retrieves a user by username (case-sensitive).
         */
        getByUsername(username) {
            return _getAll().find(u => u.username === username) || null;
        },

        /**
         * usernameExists – checks whether a username is already taken.
         */
        usernameExists(username) {
            return _getAll().some(u => u.username === username);
        },

        /**
         * add – adds a new user to the store.
         * Automatically adds the id and createdAt fields.
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
         * update – updates fields of an existing user by ID.
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
         * delete – deletes a user by ID.
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
