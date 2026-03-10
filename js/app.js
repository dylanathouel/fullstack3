/**
 * app.js – main client logic
 * =================================
 * Initialises all system components and manages user interaction.
 * Includes: session management, login/register pages, and the meetings page.
 *
 * FAJAX flow:
 *   _fajaxRequest → FXMLHttpRequest.send() → Network.transmit()
 *   → [delay ± drop] → Server.handleRequest() → sendResponse()
 *   → [delay ± drop] → FXMLHttpRequest._handleResponse()
 *   → xhr.onload / xhr.onerror → onSuccess / onError / onNetworkError
 */
const App = (() => {

    /* ══════════════════════════════════════════
       Application state
    ══════════════════════════════════════════ */
    let currentUser    = null;   // current user object (password excluded)
    let sessionToken   = null;   // active session token
    let _loadingCount  = 0;      // active-request counter (prevents premature loading-bar removal)
    let _meetingsReqSeq = 0;     // monotonic sequence counter for meeting-load requests – guards against race conditions

    /* ══════════════════════════════════════════
       Session management
    ══════════════════════════════════════════ */

    /**
     * _saveSession – stores the token and user in sessionStorage after a successful login.
     * sessionStorage is automatically cleared when the tab is closed.
     */
    function _saveSession(token, user) {
        sessionToken = token;
        currentUser  = user;
        sessionStorage.setItem('m_token', token);
        sessionStorage.setItem('m_user',  JSON.stringify(user));
    }

    /**
     * _loadSession – attempts to restore an existing session from sessionStorage.
     */
    function _loadSession() {
        const token = sessionStorage.getItem('m_token');
        const user  = sessionStorage.getItem('m_user');
        if (token && user) {
            sessionToken = token;
            currentUser  = JSON.parse(user);
            return true;
        }
        return false;
    }

    /**
     * _clearSession – clears the current session (both in memory and in storage).
     */
    function _clearSession() {
        sessionToken = null;
        currentUser  = null;
        sessionStorage.removeItem('m_token');
        sessionStorage.removeItem('m_user');
    }

    /* ══════════════════════════════════════════
       UI Helpers
    ══════════════════════════════════════════ */

    /**
     * _showLoading – shows the loading bar. Uses a counter to support concurrent requests.
     */
    function _showLoading() {
        _loadingCount++;
        document.getElementById('loading').classList.remove('hidden');
    }

    /**
     * _hideLoading – hides the loading bar. Only hides when there are no more active requests.
     */
    function _hideLoading() {
        _loadingCount = Math.max(0, _loadingCount - 1);
        if (_loadingCount === 0) {
            document.getElementById('loading').classList.add('hidden');
        }
    }

    /**
     * _showError – displays an error message in a given element.
     */
    function _showError(elementId, message) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    }

    /**
     * _hideError – hides an error message.
     */
    function _hideError(elementId) {
        const el = document.getElementById(elementId);
        if (el) el.classList.add('hidden');
    }

    /**
     * _showToast – displays a temporary toast notification at the bottom of the screen.
     */
    function _showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent  = message;
        toast.className    = `toast toast-${type}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    /**
     * _updateHeader – updates the header based on the current session state.
     * Shows the username and logout button when logged in, hides it otherwise.
     */
    function _updateHeader() {
        const header  = document.getElementById('app-header');
        const display = document.getElementById('username-display');
        if (currentUser) {
            header.classList.remove('hidden');
            display.textContent = `שלום, ${currentUser.username}`;
        } else {
            header.classList.add('hidden');
        }
    }

    /* ══════════════════════════════════════════
       FAJAX Helper – asynchronous server communication
    ══════════════════════════════════════════ */

    /**
     * _fajaxRequest – creates and sends a request to the server.
     * Supports automatic retry on network error (dropped message).
     * Automatically handles 401 responses (expired session).
     */
    function _fajaxRequest({ method, url, data, token, onSuccess, onError, onNetworkError, retries = 2, _isRetry = false }) {
        if (!_isRetry) _showLoading();

        const xhr = new FXMLHttpRequest();
        xhr.open(method, url);

        // Set required headers before sending
        if (token)  xhr.setRequestHeader('Authorization', token);
        if (data)   xhr.setRequestHeader('Content-Type', 'application/json');

        // ─── onload: fired when the server sends a response (any status) ─────────────────
        // Event handler defined by the system
        xhr.onload = () => {
            _hideLoading();
            const response = JSON.parse(xhr.responseText);

            // Expired session (rare in this project) – clear and redirect to login
            if (xhr.status === 401 && url.startsWith('/api')) {
                _clearSession();
                _updateHeader();
                SPA.resetRoute();
                SPA.navigateTo('login');
                _showToast('פג תוקף ה-session, נא להתחבר מחדש', 'error');
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                if (typeof onSuccess === 'function') onSuccess(response);
            } else {
                if (typeof onError === 'function') onError(response.error || 'שגיאה לא ידועה');
            }
        };

        // ─── onerror: fired when the network dropped the message ──────────────────────
        // Event handler defined by the system
        xhr.onerror = () => {
            if (retries > 0) {
                console.log(`[App] Network drop on ${method} ${url} – retrying (${retries} left)`);
                _showToast(`📡 שגיאת רשת – מנסה שוב... (${retries} נסיון${retries > 1 ? 'ות' : ''} נותר${retries > 1 ? 'ות' : ''})`, 'retry');
                _fajaxRequest({ method, url, data, token, onSuccess, onError, onNetworkError, retries: retries - 1, _isRetry: true });
            } else {
                _hideLoading();
                console.error(`[App] All retries exhausted for ${method} ${url}`);
                if (typeof onNetworkError === 'function') onNetworkError();
            }
        };

        // Send the actual request
        xhr.send(data ? JSON.stringify(data) : null);
    }

    /* ══════════════════════════════════════════
       Login page
    ══════════════════════════════════════════ */

    /**
     * _initLoginPage – initialises the login page and sets up the form handler.
     * Called by the SPA every time the login route is entered.
     */
    function _initLoginPage() {
        const form = document.getElementById('login-form');
        if (!form) return;

        form.addEventListener('submit', e => {
            e.preventDefault();
            _hideError('login-error');

            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;

            if (!username || !password) {
                _showError('login-error', 'נא למלא את כל השדות');
                return;
            }

            // Call the function responsible for sending requests to the server
            _fajaxRequest({
                method:   'POST',
                url:      '/auth/login',
                data:     { username, password },
                onSuccess: res => {
                    _saveSession(res.token, res.user);
                    _updateHeader();
                    SPA.navigateTo('meetings');
                },
                onError:       msg => _showError('login-error', msg),
                onNetworkError: () => _showError('login-error', 'שגיאת רשת – נא לנסות שוב')
            });
        });
    }

    /* ══════════════════════════════════════════
       Register page
    ══════════════════════════════════════════ */

    /**
     * _initRegisterPage – initialises the registration page and sets up the form handler.
     */
    function _initRegisterPage() {
        const form = document.getElementById('register-form');
        if (!form) return;

        form.addEventListener('submit', e => {
            // Prevent default form submission (page reload) to allow SPA and FAJAX to work
            e.preventDefault();

            // Hide any previous error messages on each new registration attempt
            _hideError('register-error');

            const username = document.getElementById('reg-username').value.trim();
            const email    = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirm  = document.getElementById('reg-confirm').value;

            if (password !== confirm) {
                _showError('register-error', 'הסיסמאות אינן תואמות');
                return;
            }

            _fajaxRequest({
                method:   'POST',
                url:      '/auth/register',
                data:     { username, email, password },
                onSuccess: res => {
                    _saveSession(res.token, res.user);
                    _updateHeader();
                    SPA.navigateTo('meetings');
                },
                onError:       msg => _showError('register-error', msg),
                onNetworkError: () => _showError('register-error', 'שגיאת רשת – נא לנסות שוב')
            });
        });
    }

    /* ══════════════════════════════════════════
       Meetings page
    ══════════════════════════════════════════ */

    /**
     * _formatDate – converts a date from YYYY-MM-DD format to DD/MM/YYYY.
     */
    function _formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    /**
     * _formatTime – displays a time in HH:MM format (already in the correct format).
     */
    function _formatTime(timeStr) {
        return timeStr || '';
    }

    /**
     * _isPast – checks whether a meeting has already passed (by date and time).
     */
    function _isPast(meeting) {
        const now         = new Date();
        const meetingDate = new Date(meeting.date + 'T' + meeting.time);
        return meetingDate < now;
    }

    /**
     * _renderMeetings – renders the list of meetings as cards on the page.
     */
    function _renderMeetings(meetings) {
        const list = document.getElementById('meetings-list');
        if (!list) return;

        if (meetings.length === 0) {
            list.innerHTML = '<p class="empty-msg">לא נמצאו פגישות</p>';
            return;
        }

        list.innerHTML = meetings.map(m => {
            const past = _isPast(m);
            // data-id attribute is used to identify the meeting when edit/delete buttons are clicked
            return `
            <div class="meeting-card ${past ? 'past' : 'upcoming'}" data-id="${m.id}">
                <div class="card-header">
                    <h3 class="meeting-title">${m.title}</h3>
                    <span class="badge ${past ? 'badge-past' : 'badge-upcoming'}">
                        ${past ? 'עבר' : 'עתידי'}
                    </span>
                </div>
                <div class="card-body">
                    <div class="meeting-meta">
                        <span class="meta-item">📅 ${_formatDate(m.date)}</span>
                        <span class="meta-item">🕐 ${_formatTime(m.time)}</span>
                        ${m.location ? `<span class="meta-item">📍 ${m.location}</span>` : ''}
                    </div>
                    ${m.participants ? `<p class="participants">👥 ${m.participants}</p>` : ''}
                </div>
                <div class="card-actions">
                    <button class="btn btn-edit" data-id="${m.id}">ערוך</button>
                    <button class="btn btn-delete" data-id="${m.id}">מחק</button>
                </div>
            </div>`;
        }).join('');

        // Attach event listeners to edit/delete buttons
        list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => _openEditModal(btn.dataset.id));
        });
        list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => _deleteMeeting(btn.dataset.id));
        });
    }

    /**
     * _loadMeetings – fetches meetings from the server with optional search and date filter.
     */
    function _loadMeetings(search = '', date = '') {
        let url = '/api/meetings';
        // URLSearchParams sanitises query values before they reach the server
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (date)   params.set('date',   date);
        if ([...params].length > 0) url += '?' + params.toString();

        // Sequence counter: each call to _loadMeetings gets a new incrementing number.
        // When the response arrives we check it belongs to the latest request.
        // If a newer request has been sent in the meantime, the old response is discarded (race condition guard).
        const seq = ++_meetingsReqSeq;

        _fajaxRequest({
            method:  'GET',
            url,
            token:   sessionToken,
            onSuccess: res => {
                // Ignore responses from older requests that arrived after a newer one
                if (seq < _meetingsReqSeq) return;
                _renderMeetings(res.meetings);
                _renderCalendar(res.meetings);
            },
            onError:       msg => _showToast('שגיאה בטעינת פגישות: ' + msg, 'error'),
            onNetworkError: () => _showToast('שגיאת רשת – נסה שוב', 'error')
        });
    }

    /* ── Meeting modal ── */

    /**
     * _showModalError – displays an error message inside the modal above the form.
     */
    function _showModalError(message) {
        const el = document.getElementById('modal-error');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    }

    /**
     * _hideModalError – hides the modal error message.
     */
    function _hideModalError() {
        const el = document.getElementById('modal-error');
        if (el) el.classList.add('hidden');
    }

    /**
     * _validateMeetingForm – validates meeting form data on the client side before sending to the server.
     * Checks: required fields, date not in the past, if today then time not in the past, at least 2 participants.
     */
    function _validateMeetingForm(data) {
        // ── Title required ──
        if (!data.title || data.title.trim().length === 0)
            return { valid: false, message: 'חובה למלא נושא לפגישה' };

        // ── Date required ──
        if (!data.date)
            return { valid: false, message: 'חובה לבחור תאריך לפגישה' };

        // ── Time required ──
        if (!data.time)
            return { valid: false, message: 'חובה לבחור שעה לפגישה' };

        // Build today's date string in YYYY-MM-DD format (local time, not UTC)
        const now      = new Date();
        const todayStr = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');

        // ── Date must not be in the past ──
        if (data.date < todayStr)
            return { valid: false, message: 'לא ניתן לקבוע פגישה בתאריך שכבר עבר' };

        // ── If the meeting is today – the time must be in the future ──
        if (data.date === todayStr) {
            const [h, m]       = data.time.split(':').map(Number);
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
     * _openModal – opens the modal for adding or editing a meeting.
     */
    function _openModal(meeting = null) {
        const modal = document.getElementById('meeting-modal');
        if (!modal) return;

        // Clear any previous error on every open
        _hideModalError();

        document.getElementById('modal-title').textContent =
            meeting ? 'עריכת פגישה' : 'פגישה חדשה';

        document.getElementById('meeting-id').value           = meeting ? meeting.id           : '';
        document.getElementById('meeting-title').value        = meeting ? meeting.title        : '';
        document.getElementById('meeting-date').value         = meeting ? meeting.date         : '';
        document.getElementById('meeting-time').value         = meeting ? meeting.time         : '';
        document.getElementById('meeting-location').value     = meeting ? meeting.location     : '';
        document.getElementById('meeting-participants').value = meeting ? meeting.participants : '';

        modal.classList.remove('hidden');
        document.getElementById('meeting-title').focus();
    }

    /**
     * _closeModal – closes the modal and clears the form and error messages.
     */
    function _closeModal() {
        const modal = document.getElementById('meeting-modal');
        if (modal) modal.classList.add('hidden');
        _hideModalError();
    }

    /**
     * _openEditModal – fetches a meeting from the server then opens the modal in edit mode.
     */
    function _openEditModal(id) {
        _fajaxRequest({
            method:  'GET',
            url:     `/api/meetings/${id}`,
            token:   sessionToken,
            onSuccess:     res => _openModal(res.meeting),
            onError:       msg => _showToast('שגיאה: ' + msg, 'error'),
            onNetworkError: () => _showToast('שגיאת רשת – נסה שוב', 'error')
        });
    }

    /**
     * _deleteMeeting – deletes a meeting after user confirmation.
     */
    function _deleteMeeting(id) {
        if (!confirm('האם אתה בטוח שברצונך למחוק פגישה זו?')) return;

        _fajaxRequest({
            method:  'DELETE',
            url:     `/api/meetings/${id}`,
            token:   sessionToken,
            onSuccess:     () => { _showToast('הפגישה נמחקה'); _loadMeetings(); },
            onError:       msg => _showToast('שגיאה במחיקה: ' + msg, 'error'),
            onNetworkError: () => _showToast('שגיאת רשת – נסה שוב', 'error')
        });
    }

    /**
     * _handleMeetingFormSubmit – handles saving the meeting form (add or update).
     * Performs client-side validation before sending to the server.
     * Calls POST to create and PUT to update.
     */
    function _handleMeetingFormSubmit(e) {
        e.preventDefault();
        _hideModalError();

        const id   = document.getElementById('meeting-id').value;
        const data = {
            title:        document.getElementById('meeting-title').value.trim(),
            date:         document.getElementById('meeting-date').value,
            time:         document.getElementById('meeting-time').value,
            location:     document.getElementById('meeting-location').value.trim(),
            participants: document.getElementById('meeting-participants').value.trim()
        };

        // ── Client-side validation before every server request ──
        const validation = _validateMeetingForm(data);
        if (!validation.valid) {
            _showModalError(validation.message);
            return;   // stop here – do not send to server
        }

        const method = id ? 'PUT' : 'POST';
        const url    = id ? `/api/meetings/${id}` : '/api/meetings';

        _fajaxRequest({
            method, url, data,
            token:   sessionToken,
            onSuccess: () => {
                _closeModal();
                _showToast(id ? 'הפגישה עודכנה' : 'הפגישה נוספה');
                _loadMeetings();
            },
            onError:       msg => _showToast('שגיאה: ' + msg, 'error'),
            onNetworkError: () => _showToast('שגיאת רשת – נסה שוב', 'error')
        });
    }

    /**
     * _renderCalendar – renders a yearly calendar highlighting days that have meetings.
     * Upcoming meetings are marked green, past meetings are marked red.
     */
    function _renderCalendar(meetings) {
        const container = document.getElementById('yearly-calendar');
        if (!container) return;

        const now   = new Date();
        const year  = now.getFullYear();

        // Build a map of dates: { 'YYYY-MM-DD': 'upcoming'|'past'|'both' }
        const dayMap = {};
        meetings.forEach(m => {
            const status = _isPast(m) ? 'past' : 'upcoming';
            if (!dayMap[m.date]) {
                dayMap[m.date] = status;
            } else if (dayMap[m.date] !== status) {
                dayMap[m.date] = 'both';
            }
        });

        const monthNames = [
            'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
            'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'
        ];
        const dayHeaders = ['ש','א','ב','ג','ד','ה','ו'];

        let html = `<div class="calendar-section">
            <h3 class="calendar-title">📆 לוח שנה ${year}</h3>
            <div class="calendar-grid">`;

        for (let month = 0; month < 12; month++) {
            const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            html += `<div class="cal-month">
                <div class="cal-month-name">${monthNames[month]}</div>
                <div class="cal-days-grid">`;

            // Day-of-week headers
            dayHeaders.forEach(d => {
                html += `<div class="cal-day-header">${d}</div>`;
            });

            // Empty cells before the first day (Saturday = column 0).
            // Israeli calendar: Saturday is the first day of the week → firstDay: 0=Sun, 6=Sat
            const startCol = (firstDay + 1) % 7; // offset: Sunday = column 1, Saturday = 0
            for (let i = 0; i < startCol; i++) {
                html += `<div class="cal-day-empty"></div>`;
            }

            // Day cells
            for (let day = 1; day <= daysInMonth; day++) {
                const mm    = String(month + 1).padStart(2, '0');
                const dd    = String(day).padStart(2, '0');
                const dateStr = `${year}-${mm}-${dd}`;
                const status  = dayMap[dateStr];
                let cls = 'cal-day';
                // add class for today
                if (dateStr === [year, mm, dd].join('-') && dateStr === [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')) {
                    cls += ' cal-today';
                }
                if (status === 'upcoming') cls += ' cal-upcoming';
                else if (status === 'past') cls += ' cal-past';
                else if (status === 'both') cls += ' cal-both';
                html += `<div class="${cls}" title="${dateStr}">${day}</div>`;
            }

            html += `</div></div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;
    }

    /**
     * _initMeetingsPage – initialises the meetings management page.
     * Loads meetings and sets up all event listeners.
     */
    function _initMeetingsPage() {
        // Initial meetings load
        _loadMeetings();

        // Add meeting button
        const addBtn = document.getElementById('add-meeting-btn');
        if (addBtn) addBtn.addEventListener('click', () => _openModal());

        // Cancel button in the add/edit modal
        const cancelBtn = document.getElementById('cancel-modal');
        if (cancelBtn) cancelBtn.addEventListener('click', _closeModal);

        // Close the modal by clicking outside of it
        const modal = document.getElementById('meeting-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) _closeModal();
            });
        }

        // Meeting form save
        const form = document.getElementById('meeting-form');
        if (form) form.addEventListener('submit', _handleMeetingFormSubmit);

        // Free-text search
        const searchInput = document.getElementById('search-input');
        const searchBtn   = document.getElementById('search-btn');
        const dateInput   = document.getElementById('date-filter');
        const clearBtn    = document.getElementById('clear-filters-btn');

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                _loadMeetings(searchInput.value.trim(), dateInput.value);
            });
        }
        if (searchInput) {
            searchInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') searchBtn.click();
            });
            searchInput.addEventListener('blur', () => {
            searchBtn.click();
            });
        }

        // Filter by date
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                _loadMeetings(searchInput.value.trim(), dateInput.value);
            });
        }

        // Clear filters
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (dateInput)   dateInput.value   = '';
                _loadMeetings();
            });
        }
    }

    /* ══════════════════════════════════════════
       Logout
    ══════════════════════════════════════════ */

    /**
     * _handleLogout – logs out from the server, clears the session and navigates to the login page.
     * Even if the request fails due to a network error, the local session is cleared.
     */
function _handleLogout() {
    const logoutCleanup = () => {
        _clearSession();
        _updateHeader();
        SPA.resetRoute();
        SPA.navigateTo('login');
    };
    // Always clean up the session regardless of the logout request outcome
    _fajaxRequest({
        method: 'POST',
        url:    '/auth/logout',
        token:  sessionToken,
        onSuccess: logoutCleanup,
        onError: logoutCleanup,
        onNetworkError: logoutCleanup
    });
}

    /* ══════════════════════════════════════════
       Main initialisation
    ══════════════════════════════════════════ */

    /**
     * init – initialises all system components and starts the SPA.
     * Called once after the DOM has loaded.
     */
    function init() {

        // 1. Register both servers with the network
        AuthServer.register();
        DataServer.register();

        // 2. Define SPA routes
        //    login – guard: if already logged in, go straight to meetings
        SPA.addRoute(
            'login',
            'login-template',
            _initLoginPage,
            () => !currentUser,
            () => SPA.navigateTo('meetings')
        );

        //    register – guard: if already logged in, go straight to meetings
        SPA.addRoute(
            'register',
            'register-template',
            _initRegisterPage,
            () => !currentUser,
            () => SPA.navigateTo('meetings')
        );

        //    meetings – guard: if not logged in, go to the login page
        SPA.addRoute(
            'meetings',
            'meetings-template',
            _initMeetingsPage,
            () => !!currentUser,
            () => SPA.navigateTo('login')
        );

        // 3. Restore an existing session from sessionStorage (after a page refresh).
        //    _loadSession restores currentUser and sessionToken from the browser,
        //    but activeSessions in AuthServer is reset on every refresh (JS memory only).
        //    restoreSession re-registers the token in AuthServer so that requests are authenticated.
        _loadSession();
        if (sessionToken && currentUser) {
            AuthServer.restoreSession(sessionToken, currentUser.id);
        }
        _updateHeader();

        // 4. Logout button in the page header
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', _handleLogout);

        // 5. Start the routing engine
        SPA.init();
    }

    return { init };

})();

/* Start the application after the DOM has finished loading */
window.addEventListener('DOMContentLoaded', App.init);
