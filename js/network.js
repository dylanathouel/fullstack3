/**
 * network.js – מודול הרשת המדומה
 * ==================================
 * אחראי על העברת הודעות בין לקוחות לשרתים ובחזרה.
 * כרגע פועל במצב מיידי (ללא השהיה וללא השמטת הודעות).
 * ניתן להפעיל את ה-delay וה-drop בעתיד על-ידי שינוי הקבועים.
 */
const Network = (() => {

    /* ─── קבועי הגדרה ─── */
    const MIN_DELAY = 1000;      // השהיה מינימלית (0 = מיידי)
    const MAX_DELAY = 3000;      // השהיה מקסימלית (0 = מיידי)
    const DROP_RATE = 0.1;      // הסתברות השמטה (0 = ללא השמטה)

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
     */
    function _sendResponse(fxhr, responseObj) {
        const delay = _randomDelay();
        setTimeout(() => {
            if (_isDropped()) {
                console.log(`[Network] ↓ Response DROPPED  (${fxhr.method} ${fxhr.url})`);
                fxhr._handleNetworkError();
                return;
            }
            console.log(`[Network] ↓ Response OK  status=${responseObj.status}  (${fxhr.method} ${fxhr.url})`);
            fxhr._handleResponse(responseObj);
        }, delay);
    }

    /* ─── ממשק ציבורי ─── */
    return {

        /**
         * register – רושם שרת ברשת לפי prefix של URL.
         * לאחר רישום, כל בקשה שכתובתה מתחילה ב-urlPrefix תנותב לשרת זה.
         */
        register(urlPrefix, server) {
            routingTable[urlPrefix] = server;
            console.log(`[Network] Registered server for prefix: ${urlPrefix}`);
        },

        /**
         * transmit – מעביר בקשה מהלקוח לשרת המתאים.
         * נקרא מ-FXMLHttpRequest.send().
         */
        transmit(fxhr) {
            const delay = _randomDelay();
            console.log(`[Network] ↑ Transmitting  (${fxhr.method} ${fxhr.url})`);

            setTimeout(() => {
                if (_isDropped()) {
                    console.log(`[Network] ↑ Request DROPPED  (${fxhr.method} ${fxhr.url})`);
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
