/**
 * network.js – מודול הרשת המדומה
 * ==================================
 * אחראי על העברת הודעות בין לקוחות לשרתים ובחזרה.
 * כרגע פועל במצב מיידי (ללא השהיה וללא השמטת הודעות).
 * ניתן להפעיל את ה-delay וה-drop בעתיד על-ידי שינוי הקבועים.
 */
const Network = (() => {

    /* ─── קבועי הגדרה ─── */
    // כדי להפעיל השהיה בעתיד: שנה ל-1000 ו-3000
    const MIN_DELAY = 1000;      // השהיה מינימלית (0 = מיידי)
    const MAX_DELAY = 3000;      // השהיה מקסימלית (0 = מיידי)
    // כדי להפעיל השמטה בעתיד: שנה לערך בין 0.1 ל-0.5
    const DROP_RATE = 0.2;      // הסתברות השמטה (0 = ללא השמטה)

    /* ─── טבלת ניתוב ─── */
    // ממפה prefix של URL (מחרוזת) לאובייקט השרת המטפל בו
    const routingTable = {};

    /**
     * _randomDelay – מחשב השהיה אקראית בין MIN_DELAY ל-MAX_DELAY.
     * כרגע מחזיר 0 (מיידי).
     * @returns {number} זמן השהיה במילישניות
     */
    function _randomDelay() {
        return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    }

    /**
     * _isDropped – קובע אם הודעה תושמט.
     * כרגע תמיד מחזיר false (DROP_RATE = 0).
     * @returns {boolean}
     */
    function _isDropped() {
        return DROP_RATE > 0 && Math.random() < DROP_RATE;
    }

    /**
     * _findServer – מחפש בטבלת הניתוב שרת שמטפל ב-URL הנתון.
     * בודק אם ה-URL מתחיל באחד מה-prefix-ים הרשומים.
     * @param {string} url
     * @returns {object|null} אובייקט השרת או null אם לא נמצא
     */
    function _findServer(url) {
        for (const prefix in routingTable) {
            if (url.startsWith(prefix)) {
                return routingTable[prefix];
            }
        }
        return null;
    }

    /**
     * _sendResponse – שולח תגובה משרת ללקוח דרך הרשת.
     * נמסרת לשרת כפרמטר כדי שלא יצטרך לדעת על מודול Network.
     * @param {FXMLHttpRequest} fxhr   – אובייקט הבקשה המקורי של הלקוח
     * @param {{ status: number, body: object }} responseObj – התגובה שבנה השרת
     */
    function _sendResponse(fxhr, responseObj) {
        const delay = _randomDelay();
        setTimeout(() => {
            if (_isDropped()) {
                console.warn(`[Network] ↓ Response DROPPED  (${fxhr.method} ${fxhr.url})`);
                fxhr._handleNetworkError();
                return;
            }
            console.info(`[Network] ↓ Response OK  status=${responseObj.status}  (${fxhr.method} ${fxhr.url})`);
            fxhr._handleResponse(responseObj);
        }, delay);
    }

    /* ─── ממשק ציבורי ─── */
    return {

        /**
         * register – רושם שרת ברשת לפי prefix של URL.
         * לאחר רישום, כל בקשה שכתובתה מתחילה ב-urlPrefix תנותב לשרת זה.
         * @param {string} urlPrefix  – קידומת URL (למשל '/auth', '/api')
         * @param {object} server     – אובייקט עם מתודת handleRequest
         */
        register(urlPrefix, server) {
            routingTable[urlPrefix] = server;
            console.info(`[Network] Registered server for prefix: ${urlPrefix}`);
        },

        /**
         * transmit – מעביר בקשה מהלקוח לשרת המתאים.
         * נקרא מ-FXMLHttpRequest.send().
         * @param {FXMLHttpRequest} fxhr – אובייקט הבקשה שיצר הלקוח
         */
        transmit(fxhr) {
            const delay = _randomDelay();
            console.info(`[Network] ↑ Transmitting  (${fxhr.method} ${fxhr.url})`);

            setTimeout(() => {
                if (_isDropped()) {
                    console.warn(`[Network] ↑ Request DROPPED  (${fxhr.method} ${fxhr.url})`);
                    fxhr._handleNetworkError();
                    return;
                }

                const server = _findServer(fxhr.url);
                if (!server) {
                    console.error(`[Network] No server found for URL: ${fxhr.url}`);
                    fxhr._handleResponse({ status: 404, body: { error: 'Server not found' } });
                    return;
                }

                // מעביר ל-handleRequest גם את פונקציית _sendResponse כדי שהשרת יחזיר תשובה דרכנו
                server.handleRequest(fxhr, _sendResponse);
            }, delay);
        },

        /**
         * getDropRate – מחזיר את ה-drop rate הנוכחי (לצרכי debug).
         * @returns {number}
         */
        getDropRate() {
            return DROP_RATE;
        }
    };

})();
