/**
 * app.js – לוגיקת הלקוח הראשית
 * =================================
 * מאתחל את כל רכיבי המערכת ומנהל את האינטראקציה עם המשתמש.
 * כולל: ניהול session, עמודי כניסה/רישום, ועמוד ניהול פגישות.
 *
 * זרימת ה-FAJAX:
 *   _fajaxRequest → FXMLHttpRequest.send() → Network.transmit()
 *   → [השהיה ± השמטה] → Server.handleRequest() → sendResponse()
 *   → [השהיה ± השמטה] → FXMLHttpRequest._handleResponse()
 *   → xhr.onload / xhr.onerror → onSuccess / onError / onNetworkError
 */
const App = (() => {

    /* ══════════════════════════════════════════
       מצב האפליקציה
    ══════════════════════════════════════════ */
    let currentUser   = null;   // אובייקט המשתמש הנוכחי (ללא סיסמה)
    let sessionToken  = null;   // טוקן ה-session הפעיל
    let _loadingCount = 0;      // מונה בקשות פעילות (למניעת הסרה מוקדמת של Loading)

    /* ══════════════════════════════════════════
       ניהול Session
    ══════════════════════════════════════════ */

    /**
     * _saveSession – שומר token ו-user ב-sessionStorage לאחר כניסה מוצלחת.
     * sessionStorage נמחק אוטומטית בסגירת הכרטיסייה.
     */
    function _saveSession(token, user) {
        sessionToken = token;
        currentUser  = user;
        sessionStorage.setItem('m_token', token);
        sessionStorage.setItem('m_user',  JSON.stringify(user));
    }

    /**
     * _loadSession – מנסה לשחזר session קיים מ-sessionStorage.
     * @returns {boolean} true אם session תקף נמצא
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
     * _clearSession – מנקה את ה-session הנוכחי (בזיכרון ובאחסון).
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
     * _showLoading – מציג ספינר טעינה. משתמש במונה כדי לתמוך בבקשות מקבילות.
     */
    function _showLoading() {
        _loadingCount++;
        document.getElementById('loading').classList.remove('hidden');
    }

    /**
     * _hideLoading – מסתיר ספינר טעינה. מסתיר רק כשאין עוד בקשות פעילות.
     */
    function _hideLoading() {
        _loadingCount = Math.max(0, _loadingCount - 1);
        if (_loadingCount === 0) {
            document.getElementById('loading').classList.add('hidden');
        }
    }

    /**
     * _showError – מציג הודעת שגיאה באלמנט מסוים.
     * @param {string} elementId
     * @param {string} message
     */
    function _showError(elementId, message) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    }

    /**
     * _hideError – מסתיר הודעת שגיאה.
     * @param {string} elementId
     */
    function _hideError(elementId) {
        const el = document.getElementById(elementId);
        if (el) el.classList.add('hidden');
    }

    /**
     * _showToast – מציג הודעת Toast זמנית בתחתית המסך.
     * @param {string} message
     * @param {'success'|'error'} type
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
     * _updateHeader – מעדכן את ה-header לפי מצב ה-session.
     * מציג שם משתמש וכפתור התנתקות אם מחובר, מסתיר אחרת.
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
       FAJAX Helper – תקשורת אסינכרונית עם השרת
    ══════════════════════════════════════════ */

    /**
     * _fajaxRequest – יוצר ושולח בקשת לשרת.
     * תומך בניסיון חוזר (retry) במקרה של שגיאת רשת (הודעה שנופלת).
     * מטפל אוטומטית בתגובת 401 (session פג תוקפו).
     *
     * @param {object} opts
     * @param {string}   opts.method          – GET / POST / PUT / DELETE
     * @param {string}   opts.url             – URL של הבקשה
     * @param {object}   [opts.data]          – גוף הבקשה (יומר ל-JSON)
     * @param {string}   [opts.token]         – טוקן Authorization
     * @param {Function} [opts.onSuccess]     – נקרא עם גוף התגובה אם status 2xx
     * @param {Function} [opts.onError]       – נקרא עם הודעת שגיאה אם status 4xx/5xx
     * @param {Function} [opts.onNetworkError]– נקרא אחרי מיצוי כל הניסיונות
     * @param {number}   [opts.retries=2]     – מספר ניסיונות חוזרים במקרה של השמטה
     * @param {boolean}  [opts._isRetry]      – פנימי: האם זה ניסיון חוזר
     */
    function _fajaxRequest({ method, url, data, token, onSuccess, onError, onNetworkError, retries = 2, _isRetry = false }) {
        if (!_isRetry) _showLoading();

        const xhr = new FXMLHttpRequest();
        xhr.open(method, url);

        // הוספת תאימות נדרשת בשליחה לשרת
        if (token)  xhr.setRequestHeader('Authorization', token);
        if (data)   xhr.setRequestHeader('Content-Type', 'application/json');

        // ─── onload: מגיע כשהשרת שלח תגובה (בכל status) ─────────────────
        // מימוש אירוע מוגדר במערכת
        xhr.onload = () => {
            _hideLoading();
            const response = JSON.parse(xhr.responseText);

            // (מקרה די נדיר בפרויקט שלנו) session פג תוקפו – ניקוי והפניה לדף כניסה
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

        // ─── onerror: מגיע כשהרשת השמיטה את ההודעה ──────────────────────
        // מימוש אירוע מוגדר במערכת
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
        
        // שליחת הבקשה בפועל
        xhr.send(data ? JSON.stringify(data) : null);
    }

    /* ══════════════════════════════════════════
       עמוד כניסה (Login)
    ══════════════════════════════════════════ */

    /**
     * _initLoginPage – מאתחל את עמוד הכניסה ומגדיר handler לטופס.
     * מופעל על-ידי ה-SPA בכל כניסה לדף.
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

            // קריאה לפונקציה שאחראית לשלוח בקשות לשרת
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
       עמוד רישום (Register)
    ══════════════════════════════════════════ */

    /**
     * _initRegisterPage – מאתחל את עמוד הרישום ומגדיר handler לטופס.
     */
    function _initRegisterPage() {
        const form = document.getElementById('register-form');
        if (!form) return;

        form.addEventListener('submit', e => {
            // ביטול התנהגות ברירת המחדל של הטופס (שליחה וטעינה מחדש של הדף) על מנת לאפשר שימוש ב SPA ו-FAJAX
            e.preventDefault();

            // הסתרת הודעות שגיאה קודמות בכל ניסיון רישום חדש
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
       עמוד פגישות (Meetings)
    ══════════════════════════════════════════ */

    /**
     * _formatDate – ממיר תאריך מפורמט YYYY-MM-DD לפורמט DD/MM/YYYY.
     * @param {string} dateStr
     * @returns {string}
     */
    function _formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    /**
     * _formatTime – מציג שעה בפורמט HH:MM (כבר בפורמט הנכון).
     * @param {string} timeStr
     * @returns {string}
     */
    function _formatTime(timeStr) {
        return timeStr || '';
    }

    /**
     * _isPast – בודק אם פגישה כבר עברה (לפי תאריך ושעה).
     * @param {object} meeting
     * @returns {boolean}
     */
    function _isPast(meeting) {
        const now         = new Date();
        const meetingDate = new Date(meeting.date + 'T' + meeting.time);
        return meetingDate < now;
    }

    /**
     * _renderMeetings – מרנדר את רשימת הפגישות בדף כרטיסיות.
     * @param {Array} meetings
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
            // data-id - תג המשמש לצורך זיהוי פנימי כאן משמש לזיהוי הפגישה בעת לחיצה על כפתור עריכה/מחיקה
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

        // הוספת event listeners לכפתורי ערוך/מחק
        list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => _openEditModal(btn.dataset.id));
        });
        list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => _deleteMeeting(btn.dataset.id));
        });
    }

    /**
     * _loadMeetings – טוען פגישות מהשרת עם אפשרות חיפוש וסינון תאריך.
     * @param {string} [search='']   – מחרוזת חיפוש חופשי
     * @param {string} [date='']     – תאריך לסינון (YYYY-MM-DD)
     */
    function _loadMeetings(search = '', date = '') {
        let url = '/api/meetings';
        //השתמשנו פה בקטנה במשהו שלא נלמד, הURLSearchParams נועד לנקות את הערכים בגישה לשרת, עשינו את זה כדי לשמור על רמה גבוה אבל בפועל הכל עובד גם בלי זה
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (date)   params.set('date',   date);
        if ([...params].length > 0) url += '?' + params.toString();

        _fajaxRequest({
            method:  'GET',
            url,
            token:   sessionToken,
            onSuccess:     res => _renderMeetings(res.meetings),
            onError:       msg => _showToast('שגיאה בטעינת פגישות: ' + msg, 'error'),
            onNetworkError: () => _showToast('שגיאת רשת – נסה שוב', 'error')
        });
    }

    /* ── Modal פגישה ── */

    /**
     * _showModalError – מציג הודעת שגיאה בתוך ה-modal מעל הטופס.
     * @param {string} message
     */
    function _showModalError(message) {
        const el = document.getElementById('modal-error');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    }

    /**
     * _hideModalError – מסתיר את הודעת השגיאה של ה-modal.
     */
    function _hideModalError() {
        const el = document.getElementById('modal-error');
        if (el) el.classList.add('hidden');
    }

    /**
     * _validateMeetingForm – בודק תקינות נתוני הטופס בצד הלקוח לפני שליחה לשרת.
     * בודק: שדות חובה, תאריך לא בעבר, אם היום – שעה לא בעבר, לפחות 2 משתתפים.
     * @param {object} data – ערכי הטופס
     * @returns {{ valid: boolean, message?: string }}
     */
    function _validateMeetingForm(data) {
        // ── נושא חובה ──
        if (!data.title || data.title.trim().length === 0)
            return { valid: false, message: 'חובה למלא נושא לפגישה' };

        // ── תאריך חובה ──
        if (!data.date)
            return { valid: false, message: 'חובה לבחור תאריך לפגישה' };

        // ── שעה חובה ──
        if (!data.time)
            return { valid: false, message: 'חובה לבחור שעה לפגישה' };

        // בונה מחרוזת תאריך היום בפורמט YYYY-MM-DD (לפי שעון מקומי, לא UTC)
        const now      = new Date();
        const todayStr = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');

        // ── תאריך לא בעבר ──
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
     * _openModal – פותח את ה-modal להוספה/עריכת פגישה.
     * @param {object|null} meeting – null להוספה, אובייקט לעריכה
     */
    function _openModal(meeting = null) {
        const modal = document.getElementById('meeting-modal');
        if (!modal) return;

        // ניקוי שגיאה קודמת בכל פתיחה
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
     * _closeModal – סוגר את ה-modal ומנקה את הטופס ואת הודעות השגיאה.
     */
    function _closeModal() {
        const modal = document.getElementById('meeting-modal');
        if (modal) modal.classList.add('hidden');
        _hideModalError();
    }

    /**
     * _openEditModal – שולף פגישה מהשרת ואחר-כך פותח את ה-modal בעריכה.
     * @param {string} id
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
     * _deleteMeeting – מוחק פגישה לאחר אישור המשתמש.
     * @param {string} id
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
     * _handleMeetingFormSubmit – מטפל בשמירת טופס הפגישה (הוספה או עדכון).
     * מבצע ולידציה בצד הלקוח לפני שליחה לשרת.
     * קורא ל-POST ליצירה ו-PUT לעדכון.
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

        // ── ולידציה בצד לקוח לפני כל שליחה לשרת ──
        const validation = _validateMeetingForm(data);
        if (!validation.valid) {
            _showModalError(validation.message);
            return;   // עוצר כאן – לא שולח לשרת
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
     * _initMeetingsPage – מאתחל את עמוד ניהול הפגישות.
     * טוען פגישות ומגדיר את כל ה-event listeners.
     */
    function _initMeetingsPage() {
        // טעינת פגישות ראשונית
        _loadMeetings();

        // כפתור הוסף פגישה
        const addBtn = document.getElementById('add-meeting-btn');
        if (addBtn) addBtn.addEventListener('click', () => _openModal());

        // כפתור ביטול modal שייך לתצוגה של הוספת/עריכת פגישה
        const cancelBtn = document.getElementById('cancel-modal');
        if (cancelBtn) cancelBtn.addEventListener('click', _closeModal);

        // מאפשר סגירה של חלון העריכה/הוספה בלחיצה מחוץ לחלון
        const modal = document.getElementById('meeting-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) _closeModal();
            });
        }

        // שמירת טופס פגישה
        const form = document.getElementById('meeting-form');
        if (form) form.addEventListener('submit', _handleMeetingFormSubmit);

        // חיפוש חופשי
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

        // סינון לפי תאריך
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                _loadMeetings(searchInput.value.trim(), dateInput.value);
            });
        }

        // ניקוי סינונים
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (dateInput)   dateInput.value   = '';
                _loadMeetings();
            });
        }
    }

    /* ══════════════════════════════════════════
       התנתקות (Logout)
    ══════════════════════════════════════════ */

    /**
     * _handleLogout – מתנתק מהשרת, מנקה session ומנווט לדף כניסה.
     * גם אם הבקשה נכשלת ברשת – מנקה את ה-session המקומי.
     */
function _handleLogout() {
    const logoutCleanup = () => {
        _clearSession();
        _updateHeader();
        SPA.resetRoute();
        SPA.navigateTo('login');
    };
    // נרצה לאפשר ניקוי של ה-session בכל מקרה של התנתקות
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
       אתחול ראשי
    ══════════════════════════════════════════ */

    /**
     * init – מאתחל את כל רכיבי המערכת ומפעיל את ה-SPA.
     * נקרא פעם אחת לאחר טעינת ה-DOM.
     */
    function init() {

        // 1. רישום שתי שרתים ברשת התקשורת
        AuthServer.register();
        DataServer.register();

        // 2. הגדרת routes ב-SPA
        //    login – guard: אם כבר מחובר, עבור ישירות לפגישות
        SPA.addRoute(
            'login',
            'login-template',
            _initLoginPage,
            () => !currentUser,
            () => SPA.navigateTo('meetings')
        );

        //    register – guard: אם כבר מחובר, עבור ישירות לפגישות
        SPA.addRoute(
            'register',
            'register-template',
            _initRegisterPage,
            () => !currentUser,
            () => SPA.navigateTo('meetings')
        );

        //    meetings – guard: אם לא מחובר, עבור לדף כניסה
        SPA.addRoute(
            'meetings',
            'meetings-template',
            _initMeetingsPage,
            () => !!currentUser,
            () => SPA.navigateTo('login')
        );

        // 3. שחזור session קיים מ-sessionStorage (לאחר רענון דף)
        //    _loadSession משחזר את currentUser ו-sessionToken מהדפדפן,
        //    אך activeSessions ב-AuthServer מתאפס בכל רענון (זיכרון JS בלבד).
        //    restoreSession רושם מחדש את הטוקן ב-AuthServer כדי שהבקשות יאומתו.
        _loadSession();
        if (sessionToken && currentUser) {
            AuthServer.restoreSession(sessionToken, currentUser.id);
        }
        _updateHeader();

        // 4. כפתור התנתקות בראש הדף
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', _handleLogout);

        // 5. הפעלת מנגנון הניתוב
        SPA.init();
    }

    return { init };

})();

/* הפעלת האפליקציה לאחר סיום טעינת ה-DOM */
window.addEventListener('DOMContentLoaded', App.init);
